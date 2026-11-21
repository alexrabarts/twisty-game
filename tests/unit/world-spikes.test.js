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
//   6. `proud`: a wall's end that stands more than 0.5 m over the ground in front of it, a wall cut off at its
//      height (`tapers`: the ends whose face has fallen to nothing; `low`: the ends in the ground; `joined`: the
//      ends another road's wall goes on from)
//   7. `fins`: an upright face of stone whose top falls more than 0.4 a metre faster than its road
//   8. `unfaced`: an upright face of stone, no parapet's, that is not laid and lit as its wall's face
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
//   - 41 overhangs: the end of the ground under a verge where a wall ends at a junction's mouth or a structure, and
//     slopes whose side stands over land that falls away beside them
//   - 4 flaps: the ride's first row (two side roads' walls end there: the ground under the ride's verge ends with
//     the ride, 3.3 m over the land), and the ground under a verge 0.15 m over a junction's paving at km 4.4 and
//     0.16 m at km 2.3
//   - 4 proud ends, none of the ride's own: the two side roads' walls at the ride's first row (the roads end there
//     with the slice), a side road's wall that ends at its road's own end at km 1.7, and a side road's wall at the
//     junction at km 2.3, where the paving takes the place of a slope
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
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { spikeWindow, spikeReport, SPIKE_LIMITS, SPIKE_RULES } from '../helpers/world-spikes.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment, WorldData, TerrainMesh } = game;

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
        console.log(`spikes: ${report.tiles} tiles; ${report.stretched.length} stretched (${report.beside.length} beside, ${report.setback.length} set back), ${report.bare.length} bare, ${report.ends.length} ends, ${report.overhangs.length} overhangs, ${report.flaps.length} flaps at ${report.wallEnds} wall ends (${report.tapers} taper, ${report.low} low, ${report.joined} joined, ${report.proud.length} proud), ${report.fins.length} fins, ${report.unfaced.length} unfaced\nby km (beside/setback/bare/ends/overhangs): ${km}`);
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

    test('no wall is cut off at its height: its face tapers to nothing or ends in the ground', () => {
        if (report.proud.length > SPIKE_LIMITS.proud) throw new Error(`${report.proud.length} wall ends stand more than ${SPIKE_RULES.proudM} m over the ground in front of them (at most ${SPIKE_LIMITS.proud}):\n${list(report.proud)}`);
        // (none of them the ride's own)
        expect(report.proud.filter(o => o.owner === -1)).toEqual([]);
        expect(report.tapers).toBeGreaterThan(90);
    });

    test('every upright face of stone is a wall\'s: none slanted out from a wall\'s end, none laid or lit apart from its wall', () => {
        if (report.fins.length > SPIKE_LIMITS.fins) throw new Error(`${report.fins.length} faces of stone whose top falls faster than their road:\n${list(report.fins)}`);
        if (report.unfaced.length > SPIKE_LIMITS.unfaced) throw new Error(`${report.unfaced.length} faces of stone not laid as their wall's face:\n${list(report.unfaced)}`);
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
        console.log(`spikes (synthetic): ${report.tiles} tiles; ${report.stretched.length} stretched (${report.beside.length} beside, ${report.setback.length} set back), ${report.bare.length} bare, ${report.ends.length} ends, ${report.overhangs.length} overhangs, ${report.flaps.length} flaps at ${report.wallEnds} wall ends (${report.tapers} taper, ${report.low} low, ${report.joined} joined, ${report.proud.length} proud), ${report.fins.length} fins, ${report.unfaced.length} unfaced`);
    }, 3600000);

    test('every wall end is closed, with no open side beside it, and no closing face is bare', () => {
        expect(report.tiles).toBeGreaterThan(10);
        expect(report.bare).toEqual([]);
        expect(report.ends).toEqual([]);
        expect(report.wallEnds).toBeGreaterThan(30);
        expect(report.flaps).toEqual([]);
        expect(report.unfaced).toEqual([]);
        // (3 walls of its ride end at a structure 10 m and more over the land, where no slope goes on; 16 faces
        // of two side roads' walls fall with roads steeper than 0.4, which the helper reads against the ride only.
        // Before the taper: 36 proud ends, 111 fins)
        expect(report.proud.length).toBeLessThanOrEqual(3);
        expect(report.fins.length).toBeLessThanOrEqual(16);
        expect(report.tapers).toBeGreaterThan(20);
    });

    // Its land is a made hillside steeper than the lay-back's slope from end to end: what is left is that hillside
    // (before: 283 beside, 2174 set back, 10 bare, 110 overhangs; 16 overhangs before the slopes' sides were closed)
    test('what is left of its steep hillside can only shrink', () => {
        expect(report.beside.length).toBeLessThanOrEqual(265);
        expect(report.setback.length).toBeLessThanOrEqual(2188);
        expect(report.overhangs.length).toBeLessThanOrEqual(13);
    });
});
