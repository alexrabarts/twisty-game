// Rides a world slice in node and reads the marker stones: every stretch of sharp drop the rule finds
// (Scenery.stoneStretches), every row round the outside of a hairpin (Scenery.hairpinRuns), every row on a wall's top
// (Scenery.wallRuns) and every stone and piece of kerb as it is drawn.
// Each place of each stretch and row is measured again here, by this file's own measures: the drop or the bend and
// the guard on the ground as it is drawn while the bike is there (groundFaults), the stopping places, the roadworks
// sites and the side roads from their own records once every chunk is here (recordFaults).
import { roadBands, clearanceOf, sceneryOf } from './world-clearance.js';
import { findHairpins } from '../../tools/world/verify.mjs';

// The road turns this much or more over BEND_SPAN_M round a place on a hairpin's arc (a straight turns nothing; a
// hairpin made of two bends has a short straight between them, and its row goes on along it)
const BEND_SPAN_M = 40;
const BEND_TURN = 20 * Math.PI / 180;

// The ride's hairpins by the importer's own check (tools/world/verify.mjs findHairpins): [{s0, s1}], each a stretch
// that holds a turn of 150 degrees inside 80 m. Not the game's list (WorldRoute.hairpins)
export function hairpinSpans(env) {
    const points = env.route.points;
    return findHairpins({ s: points.map(p => p.s), heading: points.map(p => p.heading), radius: points.map(() => Infinity) });
}

// The ride's row before a place, the road there and the verge's outer edge
function frame(game, env, q) {
    const s = q.s, route = env.route;
    const p = route.sample(s, {});
    const i = Math.min(route.points.length - 2, route.indexAt(s));
    return { s, p, i, cos: Math.cos(p.heading), sin: Math.sin(p.heading), edge: p.width / 2 + game.RoadSurface.VERGE_M, hint: { start: i - 4, end: i + 4 } };
}

// What a place {s, side, x, y, z} fails on the drawn ground: a wall or a structure that guards the edge, a foot off its
// own road's edge, and by its case: at a drop, no sharp drop on its side or a rise on the way out; in a hairpin's row
// (`spans`: hairpinSpans), a place outside every hairpin, on a road that does not bend there, on the inside of the
// bend, or with no drop behind it (dropM, as at a stretch). A list of words, empty when it stands well
export function groundFaults(game, env, q, spans = null) {
    const { Scenery } = game;
    const rule = Scenery.STONE_RULE, points = env.route.points;
    const { s, p, i, cos, sin, edge, hint } = frame(game, env, q);
    const bad = [];
    const groundAt = d => env.ground.groundY(p.x + q.side * (edge + d) * cos, p.z - q.side * (edge + d) * sin, hint);
    if (spans) {
        // (in pieces: a hairpin turns more than half a circle inside the span, and one read of it would wrap)
        let turn = 0;
        for (let d = -BEND_SPAN_M / 2; d < BEND_SPAN_M / 2; d += 4) turn += env.route.headingChange(s + d, s + d + 4);
        if (!spans.some(h => s >= h.s0 && s <= h.s1)) bad.push('outside every hairpin');
        if (!(Math.abs(turn) >= BEND_TURN)) bad.push(`the road turns ${(turn * 180 / Math.PI).toFixed(0)} degrees there`);
        // (a heading that grows turns toward +lateral: the outside is the other side)
        else if (q.side !== -Math.sign(turn)) bad.push('the inside of the bend');
        // A drop: the land falls away behind the stone as far as at a stretch
        const fall = p.y - groundAt(rule.reachM);
        if (!(fall > rule.dropM)) bad.push(`no drop: the land ${fall.toFixed(2)} m under the road behind it`);
    } else {
        const fall = p.y - groundAt(rule.reachM);
        if (!(fall > rule.dropM)) bad.push(`drop ${fall.toFixed(2)} m`);
        for (let d = 1; d < rule.reachM; d += 1) if (groundAt(d) > p.y + 0.3) bad.push(`the land rises ${d} m out`);
    }
    for (const j of [i - 1, i, i + 1]) {
        if (j >= 0 && env.walledAt(j, q.side)) bad.push(`a wall under the edge at row ${j}`);
        const flags = points[Math.max(0, j)].flags || {};
        if (flags.bridge || flags.tunnel || flags.gallery) bad.push(`a structure at row ${j}`);
    }
    // The physics has nothing solid at the edge either (a parapet, a barrier)
    const zone = env.ground.zoneAt({ index: i, lateral: q.side * (edge + 0.5), t: 0, roadY: p.y, flags: points[i].flags }, p.width / 2);
    if (zone.kind === 'wall') bad.push('a solid edge');
    const own = env.route.project(q.x, q.z, hint, {});
    if (Math.sign(own.lateral) !== q.side || Math.abs(own.lateral) < edge || Math.abs(own.lateral) > edge + 1) bad.push(`${own.lateral.toFixed(2)} m from the centre line`);
    const foot = env.ground.groundY(q.x, q.z, hint);
    if (Math.abs(foot - p.y) > Scenery.ROADSIDE_STEP_M) bad.push(`the ground at its foot ${(foot - p.y).toFixed(2)} m from the road's height`);
    if (q.y > foot + 1e-6) bad.push(`its foot ${(q.y - foot).toFixed(2)} m over the ground`);
    return bad;
}

// What a place on a wall's top fails: no wall under the road's edge there, a wall with a parapet, one that does not
// hold the road up (its face drops less than wallLowM), or a stone off the middle of the wall's coping (its seat is
// the coping's top, COPING_UP_M over the edge, and it stands COPING_W_M / 2 in from the face). A list of words
export function wallFaults(game, env, q) {
    const { Scenery, RoadMesh } = game;
    const rule = Scenery.STONE_RULE;
    const { p, i, edge } = frame(game, env, q);
    const bad = [];
    const top = [i - 1, i, i + 1].map(j => env.ground.wallTop(j, q.side)).filter(Boolean);
    if (!top.length) bad.push('no wall under the edge');
    if (top.some(t => t.railed)) bad.push('a wall with a parapet');
    if (top.some(t => Math.min(...t.heights) < rule.wallLowM)) bad.push('a wall that does not hold the road up');
    const own = env.route.project(q.x, q.z, { start: i - 4, end: i + 5 }, {});
    const want = edge + RoadMesh.STONE_PROUD_M - RoadMesh.COPING_W_M / 2;
    if (Math.sign(own.lateral) !== q.side || Math.abs(Math.abs(own.lateral) - want) > 0.15) bad.push(`${own.lateral.toFixed(2)} m from the centre line, not on the middle of the coping (${want.toFixed(2)})`);
    if (Math.abs(q.seat - (p.y + RoadMesh.COPING_UP_M)) > 0.3) bad.push(`seated ${(q.seat - p.y).toFixed(2)} m over the road, not on the coping`);
    // (a stone and a margin either side fit on the coping)
    if (RoadMesh.COPING_W_M < Scenery.STONE_WIDTH_M + 2 * RoadMesh.COPING_MARGIN_M - 1e-9) bad.push('a coping narrower than a stone and its margins');
    return bad;
}

// What a place fails by the records: a stopping place on its side, a roadworks site, a side road's band near it
export function recordFaults(game, env, bands, q) {
    const { Scenery } = game;
    const rule = Scenery.STONE_RULE;
    const { s } = frame(game, env, q);
    const bad = [];
    for (const place of env.places.all) if (Math.sign(place.side) === q.side && s >= place.s && s <= place.s + place.length) bad.push(`in the stopping place ${place.id}`);
    for (const site of env.roadworks.sites) {
        const all = site.elements.map(e => e.s).concat(site.s0, site.s1);
        if (s >= Math.min(...all) && s <= Math.max(...all)) bad.push(`in the roadworks site ${site.id}`);
    }
    const r = Scenery.STONE_RADIUS_M;
    const near = clearanceOf(bands, [[-r, -r], [r, -r], [r, r], [-r, r]].map(([a, c]) => [q.x + a, q.z + c]), -Infinity, Infinity, g => g.kind === 'ride');
    if (near.clearance < rule.mouthM - 2 * r) bad.push(`${near.clearance.toFixed(2)} m from the side road of edge ${near.edgeId}`);
    return bad;
}

// {env, stretches, rows, walls, hairpins, spans, stones, kerbs, sites, windows, most}.
// A stretch of drop: {start, side, used, places, faults: [words], mirror: [words]} (`start` its first station; `mirror`: what its first stone
// fails when it is planted on the other side of the road). A hairpin's row: {hairpin, side, used, places, faults,
// mirror} (`mirror`: its first stone on the inside of the bend). A wall's row: {start, side, used, places, faults}.
// `sites`: every stone a tile holds, {x, z, kind, next}; `hairpins`: every hairpin of the game's list with
// {used, places} (the places of its row, 0 where every place is guarded). A stone: {x, z, y0, y1, low, middle}, `low`
// the lowest drawn ground under the corners of its foot, `middle` the ground under its middle. A piece of kerb:
// {a, b, top, foot, ground}: its two ends in plan, its top and its foot at each end and at its middle and the drawn
// ground there. A window, read at each step of the ride: {s, shown, sites, kerbs, farthestShown, nearestHidden} (the
// stones drawn of those the tiles hold, the pieces of kerb drawn, and how far from the bike). `most`: the most stones drawn at once
export async function rideStones(game, { id = 'tremola', search = '', fetchFn, stepM = 100 } = {}) {
    const { THREE, WorldEnvironment, WorldStreamer, Scenery, RoadSurface } = game;
    const env = await WorldEnvironment.load(new THREE.Scene(), { id, search, fetchFn, models: null, digest: async () => '0' });
    const stones = new Map(), kerbs = new Map(), sites = new Map(), windows = [];
    let most = 0;
    const matrix = new THREE.Matrix4(), v = new THREE.Vector3();
    // What is drawn now: the stones and the kerb of every tile, and which stones the cap took
    const look = (s, bike) => {
        env.scenery.rankStones(bike);
        most = Math.max(most, env.scenery.stoneCount || 0);
        // (a drawn stone is where its matrix says, in 32-bit numbers: matched to its site by place, not by text)
        const shown = [];
        let sites = 0, hidden = Infinity, far = 0;
        const all = siteMap;
        for (const held of env.scenery.perTile.values()) {
            for (const mesh of held.group.children) {
                if (mesh.name === 'stones') for (const t of sceneryOf(THREE, mesh)) {
                    const [x, z] = t.at, key = `${x.toFixed(2)},${z.toFixed(2)}`;
                    shown.push([x, z]);
                    far = Math.max(far, Math.hypot(x - bike.x, z - bike.z));
                    if (stones.has(key)) continue;
                    const under = t.poly.map(([px, pz]) => env.ground.groundY(px, pz, null));
                    // (where the stone itself was put: its lean moves the middle of its foot)
                    stones.set(key, { x, z, y0: t.y0, y1: t.y1, low: Math.min(...under), middle: env.ground.groundY(x, z, null) });
                }
                if (mesh.name === 'stone-kerbs') for (let i = 0; i < mesh.count; i++) {
                    mesh.getMatrixAt(i, matrix);
                    const at = (y, along) => { v.set(0, y, along).applyMatrix4(matrix); return [v.x, v.y, v.z]; };
                    const a = at(0, -0.5), b = at(0, 0.5), key = `${a[0].toFixed(2)},${a[2].toFixed(2)}`;
                    if (kerbs.has(key)) continue;
                    const K = Scenery.KERB;
                    const ends = [-0.5, 0, 0.5].map(along => ({ top: at(K.proudM, along)[1], foot: at(-K.rootM, along)[1], ground: env.ground.groundY(at(0, along)[0], at(0, along)[2], null) }));
                    kerbs.set(key, { a: [a[0], a[2]], b: [b[0], b[2]], ends });
                }
            }
            for (const q of held.stoneSites || []) {
                sites++;
                const key = `${q.x.toFixed(2)},${q.z.toFixed(2)}`;
                if (!all.has(key)) all.set(key, { x: q.x, z: q.z, kind: q.kind, next: q.next });
                if (!shown.some(([x, z]) => Math.abs(x - q.x) < 0.02 && Math.abs(z - q.z) < 0.02)) hidden = Math.min(hidden, Math.hypot(q.x - bike.x, q.z - bike.z));
            }
        }
        windows.push({ s, shown: shown.length, sites, kerbs: env.scenery.kerbCount || 0, farthestShown: far, nearestHidden: hidden });
    };
    const siteMap = sites;
    const stretches = [], rows = [], walls = [], found = new Set();
    const gap = Scenery.STONE_GAP_M, points = env.route.points;
    const spans = hairpinSpans(env);
    const hairpins = env.route.hairpins().map(h => ({ ...h, used: Scenery.hairpinUsed(h), places: 0, read: false }));
    const words = (q, list) => list.map(f => `s ${q.s.toFixed(1)} side ${q.side}: ${f}`);
    for (let s = env.startS; s <= env.endS + stepM; s += stepM) {
        const p = env.route.sample(Math.min(s, env.endS), {});
        env.lastBike = { x: p.x, z: p.z };
        await env.streamer.settle({ x: p.x, z: p.z }, s);
        // Time passes as it would on the ride, so what is left behind is let go and its share of the cap comes back
        env.streamClockMs += 2 * WorldStreamer.DISPOSE_AFTER_MS;
        await env.streamer.settle({ x: p.x, z: p.z }, s);
        look(s, env.lastBike);
        // The stretches and the walls by the bike, read while their land is here, each once (read whole, on past the
        // bike to its ends)
        const at = Math.min(s, env.endS), k0 = Math.floor((at - stepM / 2) / gap), k1 = Math.ceil((at + stepM / 2) / gap);
        for (const side of [-1, 1]) {
            for (const run of env.scenery.stoneStretches(k0, k1, side)) {
                const id = `drop:${side}:${run[0].k}`;
                if (found.has(id)) continue;
                found.add(id);
                const places = run.map(q => ({ ...q }));
                // The same stone planted on the other side of the road, for the check that the measures can fail
                const first = places[0], across = env.route.project(first.x, first.z, { start: first.index - 4, end: first.index + 4 }, {});
                const m = env.route.sample(first.s, {});
                const mirror = { ...first, side: -side, x: m.x - across.lateral * Math.cos(m.heading), z: m.z + across.lateral * Math.sin(m.heading) };
                stretches.push({ start: run[0].k, side, used: Scenery.stoneUsed(run[0].k, side), places, faults: places.flatMap(q => words(q, groundFaults(game, env, q))), mirror: groundFaults(game, env, mirror) });
            }
            const i0 = env.route.indexAt(Math.max(0, at - stepM / 2)), i1 = env.route.indexAt(Math.min(env.route.length, at + stepM / 2));
            for (const run of env.scenery.wallRuns(i0, i1, side)) {
                const id = `wall:${side}:${run.start}`;
                if (found.has(id)) continue;
                found.add(id);
                const places = run.map(q => ({ ...q }));
                walls.push({ start: run.start, side, used: Scenery.wallUsed(run.start, side), places, faults: places.flatMap(q => words(q, wallFaults(game, env, q))) });
            }
        }
        // And the hairpins it has reached
        for (const h of hairpins) {
            if (h.read || h.apex > s + stepM / 2) continue;
            h.read = true;
            for (const run of env.scenery.hairpinRuns(h)) {
                const places = run.map(q => ({ ...q }));
                h.places += places.length;
                const first = places[0], across = env.route.project(first.x, first.z, { start: first.index - 4, end: first.index + 4 }, {});
                const m = env.route.sample(first.s, {});
                const mirror = { ...first, side: -first.side, x: m.x - across.lateral * Math.cos(m.heading), z: m.z + across.lateral * Math.sin(m.heading) };
                rows.push({ hairpin: h, side: first.side, used: h.used, places, faults: places.flatMap(q => words(q, groundFaults(game, env, q, spans))), mirror: groundFaults(game, env, mirror, spans) });
            }
        }
    }
    await env.data.ensureChunks(env.data.manifest.chunks.map((_, k) => k));
    const bands = roadBands(env, RoadSurface.VERGE_M);
    for (const stretch of stretches.concat(rows, walls)) stretch.faults.push(...stretch.places.flatMap(q => words(q, recordFaults(game, env, bands, q))));
    stretches.sort((a, b) => a.places[0].s - b.places[0].s || a.side - b.side);
    walls.sort((a, b) => a.start - b.start || a.side - b.side);
    return { env, stretches, rows, walls, hairpins, spans, stones: [...stones.values()], kerbs: [...kerbs.values()], sites: [...sites.values()], windows, most };
}
