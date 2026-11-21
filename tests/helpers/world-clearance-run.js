// Rides a world slice in node and gathers every scenery placement as it is built, for the clearance audit
import { roadBands, sceneryOf, footprint } from './world-clearance.js';

// The edges of the side road a barrier closes: its edge from the junction, and on through every node the road only
// passes (degree 2) while it is a side road, to STUB_M and a little more
export function sideRoadOf(data, edgeId, nodeId, lengthM = 80) {
    const out = [];
    let edge = data.edges[edgeId], from = nodeId, run = 0;
    while (edge && !edge.onRide && !out.includes(edge.id) && run < lengthM) {
        out.push(edge.id);
        run += edge.length;
        const far = edge.a === from ? edge.b : edge.a;
        if (data.nodes.degree[far] !== 2) break;
        from = far;
        edge = data.edges.find(e => e.id !== out[out.length - 1] && (e.a === far || e.b === far));
    }
    return out;
}

// Loads the stage, rides it in `stepM` steps with the streamer settled at each, and returns the bands and the things
export async function rideAndGather(game, { id = 'tremola', search = '', fetchFn, stepM = 200, models = null } = {}) {
    const { THREE, WorldEnvironment, WorldStreamer, RoadSurface, RoadMesh } = game;
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
    // Every barrier of every pass, where the game puts it (WorldEnvironment.updateBarriers), on its own side edge
    const box = RoadMesh.barrierGeometry();
    box.computeBoundingBox();
    const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const placed = new Set();
    for (const junction of env.graph.junctions) {
        for (const pass of junction.passes) {
            env.barrierStep = null;
            env.updateBarriers(pass.sIn);
            for (const b of env.activeBarriers) {
                const key = `${b.junctionId}:${b.edgeId}:${b.x.toFixed(2)}:${b.z.toFixed(2)}`;
                if (placed.has(key)) continue;
                placed.add(key);
                rotation.setFromAxisAngle(up, b.heading);
                const y = (Number.isFinite(b.y) ? b.y : env.ground.landY(b.x, b.z, 0)) - 0.1;
                matrix.compose(new THREE.Vector3(b.x, y, b.z), rotation, new THREE.Vector3(2 * game.WorldGround.barrierHalf(b.width), 1, 1));
                const chain = sideRoadOf(env.data, b.edgeId, b.node);
                things.push({ type: 'barrier', name: `barrier:${b.junctionId}:${b.edgeId}`, edgeId: b.edgeId, chain, junctionId: b.junctionId, ...footprint(THREE, box.boundingBox, matrix), x: b.x, z: b.z });
            }
        }
    }
    return { env, scene, bands, things };
}
