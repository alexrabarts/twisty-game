// Rides a world slice in node and gathers every scenery placement as it is built, for the clearance audit
import { roadBands, sceneryOf } from './world-clearance.js';

// Loads the stage, rides it in `stepM` steps with the streamer settled at each, and returns the bands and the things
export async function rideAndGather(game, { id = 'tremola', search = '', fetchFn, stepM = 200, models = null } = {}) {
    const { THREE, WorldEnvironment, WorldStreamer, RoadSurface } = game;
    const scene = new THREE.Scene();
    const env = await WorldEnvironment.load(scene, { id, search, fetchFn, models, digest: async () => '0' });
    const things = [];
    const seen = new Set();
    // Every tile's scenery as it is built (with the ground as it was then), not only the last window's
    const build = env.scenery.buildTile.bind(env.scenery);
    const take = (group, tile) => {
        for (const t of sceneryOf(THREE, group)) {
            const key = `${t.type}:${t.name}:${t.x.toFixed(2)},${t.z.toFixed(2)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            // The drawn ground under it, read while its tile is here: over a tunnel or a gallery, and away from every
            // road (past the ride's ends the nearest point is no guide), that is the land
            const gx = t.at ? t.at[0] : t.x, gz = t.at ? t.at[1] : t.z, loc = {};
            const under = env.ground.groundY(gx, gz, null, false, loc);
            const roofed = (loc.flags && (loc.flags.tunnel || loc.flags.gallery)) || env.scenery.roads.clearance(gx, gz, 20) >= 20;
            things.push({ ...t, tile, groundY: roofed ? env.ground.landY(gx, gz, under) : under });
        }
    };
    env.scenery.buildTile = (tile, ...rest) => {
        const group = build(tile, ...rest);
        if (group) take(group, tile.key);
        // The trees are drawn in the forest across the tiles (Scenery.rankTrees): each of the tile's, at its widest level
        const held = env.scenery.perTile.get(tile.key);
        if (held && held.treeSites && held.treeSites.length) {
            const trees = game.Scenery.treeMeshes(held.treeSites, 'near');
            take(trees, tile.key);
            trees.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
        }
        return group;
    };
    for (let s = env.startS; s <= env.endS; s += stepM) {
        const p = env.route.sample(s, {});
        env.lastBike = { x: p.x, z: p.z };
        await env.streamer.settle({ x: p.x, z: p.z }, s);
        // Time passes as it would on the ride, so what is left behind is let go and its share of the caps comes back
        env.streamClockMs += 2 * WorldStreamer.DISPOSE_AFTER_MS;
        await env.streamer.settle({ x: p.x, z: p.z }, s);
        // The marker stones are put up on the nearest tiles and chosen nearest the bike first (Scenery.rankStones):
        // those drawn now, as the bike is here
        env.scenery.rankStones(env.lastBike);
        for (const [key, held] of env.scenery.perTile) for (const mesh of held.group.children) if (mesh.name === 'stones') take(mesh, key);
    }
    // The fixtures: the landmarks
    for (const t of sceneryOf(THREE, env.group)) if (t.type === 'landmark') things.push(t);
    // Every chunk, so the bands hold every side road
    await env.data.ensureChunks(env.data.manifest.chunks.map((_, k) => k));
    const bands = roadBands(env, RoadSurface.VERGE_M);
    return { env, scene, bands, things };
}
