// Rides a world slice in node and reads the marker stones: every stretch of sharp drop the rule finds (Scenery.stoneRuns)
// and every stone as it is built. Each place of each stretch is measured again here, by this file's own measures: the
// drop and the guard on the ground as it is drawn while the bike is there (groundFaults), the stopping places, the
// roadworks sites and the side roads from their own records once every chunk is here (recordFaults).
import { roadBands, clearanceOf, sceneryOf } from './world-clearance.js';

// The ride's row before a place, the road there and the verge's outer edge
function frame(game, env, q) {
    const s = q.k * game.Scenery.STONE_GAP_M, route = env.route;
    const p = route.sample(s, {});
    const i = Math.min(route.points.length - 2, route.indexAt(s));
    return { s, p, i, cos: Math.cos(p.heading), sin: Math.sin(p.heading), edge: p.width / 2 + game.RoadSurface.VERGE_M, hint: { start: i - 4, end: i + 4 } };
}

// What a place {k, side, x, y, z} fails on the drawn ground: no sharp drop on its side, a rise on the way out, a wall
// or a structure that guards the edge, a foot off its own road's edge. A list of words, empty when it stands well
export function groundFaults(game, env, q) {
    const { Scenery } = game;
    const rule = Scenery.STONE_RULE, points = env.route.points;
    const { p, i, cos, sin, edge, hint } = frame(game, env, q);
    const bad = [];
    const groundAt = d => env.ground.groundY(p.x + q.side * (edge + d) * cos, p.z - q.side * (edge + d) * sin, hint);
    const fall = p.y - groundAt(rule.reachM);
    if (!(fall > rule.dropM)) bad.push(`drop ${fall.toFixed(2)} m`);
    for (let d = 1; d < rule.reachM; d += 1) if (groundAt(d) > p.y + 0.3) bad.push(`the land rises ${d} m out`);
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

// {env, stretches, stones, most}. A stretch: {block, side, used, places, faults: [words], mirror: [words]} (`mirror`:
// what its first stone fails when it is planted on the other side of the road). A stone: {x, z, y0, y1,
// low, middle}, `low` the lowest drawn ground under the corners of its foot, `middle` the ground under its middle.
// `most`: the most stones standing at once
export async function rideStones(game, { id = 'tremola', search = '', fetchFn, stepM = 100 } = {}) {
    const { THREE, WorldEnvironment, WorldStreamer, Scenery, RoadSurface } = game;
    const env = await WorldEnvironment.load(new THREE.Scene(), { id, search, fetchFn, models: null, digest: async () => '0' });
    const stones = new Map();
    let most = 0;
    const build = env.scenery.buildTile.bind(env.scenery);
    env.scenery.buildTile = (tile, ...rest) => {
        const group = build(tile, ...rest);
        most = Math.max(most, env.scenery.stoneCount || 0);
        if (group) for (const t of sceneryOf(THREE, group)) {
            if (t.type !== 'stone') continue;
            const under = t.poly.map(([x, z]) => env.ground.groundY(x, z, null));
            // (where the stone itself was put: its lean moves the middle of its foot)
            const [x, z] = t.at;
            stones.set(`${x.toFixed(2)},${z.toFixed(2)}`, { x, z, y0: t.y0, y1: t.y1, low: Math.min(...under), middle: env.ground.groundY(x, z, null) });
        }
        return group;
    };
    const rule = Scenery.STONE_RULE;
    const stretches = [];
    const blocks = Math.ceil(env.route.length / rule.blockM);
    let next = 0;
    for (let s = env.startS; s <= env.endS + stepM; s += stepM) {
        const p = env.route.sample(Math.min(s, env.endS), {});
        env.lastBike = { x: p.x, z: p.z };
        await env.streamer.settle({ x: p.x, z: p.z }, s);
        // Time passes as it would on the ride, so what is left behind is let go and its share of the cap comes back
        env.streamClockMs += 2 * WorldStreamer.DISPOSE_AFTER_MS;
        await env.streamer.settle({ x: p.x, z: p.z }, s);
        // The blocks the bike has reached, read while their land is here
        for (; next < blocks && (next + 0.5) * rule.blockM <= s + stepM / 2; next++) {
            for (const side of [-1, 1]) for (const run of env.scenery.stoneRuns(next, side)) {
                const places = run.map(q => ({ ...q }));
                // The same stone planted on the other side of the road, for the check that the measures can fail
                const first = places[0], across = env.route.project(first.x, first.z, { start: first.index - 4, end: first.index + 4 }, {});
                const m = env.route.sample(first.k * Scenery.STONE_GAP_M, {});
                const mirror = { ...first, side: -side, x: m.x - across.lateral * Math.cos(m.heading), z: m.z + across.lateral * Math.sin(m.heading) };
                stretches.push({ block: next, side, used: Scenery.stoneUsed(next, side), places, faults: places.flatMap(q => groundFaults(game, env, q).map(f => `s ${q.k * Scenery.STONE_GAP_M} side ${q.side}: ${f}`)), mirror: groundFaults(game, env, mirror) });
            }
        }
    }
    await env.data.ensureChunks(env.data.manifest.chunks.map((_, k) => k));
    const bands = roadBands(env, RoadSurface.VERGE_M);
    for (const stretch of stretches) stretch.faults.push(...stretch.places.flatMap(q => recordFaults(game, env, bands, q).map(f => `s ${q.k * Scenery.STONE_GAP_M} side ${q.side}: ${f}`)));
    return { env, stretches, stones: [...stones.values()], most };
}
