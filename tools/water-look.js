// The lakes of a world ride, for world-look: for each lake the ride passes within REACH_M of, the bike put down where
// it is nearest, then the far and the near chase views and two close views of its water (from the shore at 6 m over
// the lake, looking out across it toward the sun's side and away from it), each with the water as drawn and with the
// water off (before: the land's paint alone); and a short sequence of the close view, the waves stepped 0.25 s a frame.
// The level of the water effect and the planar reflection are reported for each view. The pictures go into --out:
//   node tools/terrain-check.mjs world-look --world gotthard-north --gpu --desk --script tools/water-look.js --out <dir>
// `window.waterLook` (set by a wrapper script before this one) may name `at` (a list of ride s), `frames` and `lakes`
// (the first and the count of the lakes found to take).
const REACH_M = 450, STEP_M = 40;
const options = window.waterLook || {};
const env = game.environment, route = env.route, data = env.data, v = game.vehicle;
const N = WorldData.TILE_N, CELL = WorldData.CELL_M, M = WorldData.TILE_M, ZW = WorldData.ZONE.water;
const pictures = {}, views = [];

// The water nodes near the ride, grouped by tile and level: a lake is the water of one level (to the metre)
const lakes = new Map();
const seen = new Set();
const from = env.stage ? env.stage.from : 0, to = env.stage ? env.stage.to : route.length;
for (let s = from; s <= to; s += STEP_M) {
    const p = route.sample(s, {});
    for (let tz = Math.floor((p.z - REACH_M) / M); tz <= Math.floor((p.z + REACH_M) / M); tz++) {
        for (let tx = Math.floor((p.x - REACH_M) / M); tx <= Math.floor((p.x + REACH_M) / M); tx++) {
            const key = `${tx},${tz}`;
            if (!seen.has(key)) { seen.add(key); if (data.hasTile(key)) await data.ensureTile(key); }
            const tile = data.tile(key);
            if (!tile) continue;
            for (let j = 0; j < N; j += 2) for (let i = 0; i < N; i += 2) {
                const k = j * N + i;
                if (tile.zones[k] !== ZW) continue;
                const x = tx * M + i * CELL, z = tz * M + j * CELL, d = Math.hypot(x - p.x, z - p.z);
                if (d > REACH_M) continue;
                const id = Math.round(tile.heights[k]);
                const lake = lakes.get(id) || { id, nodes: 0, best: null, sx: 0, sz: 0, y: tile.heights[k] };
                if (!lakes.has(id)) lakes.set(id, lake);
                lake.nodes++; lake.sx += x; lake.sz += z;
                if (!lake.best || d < lake.best.d) lake.best = { s, d, x, z };
            }
        }
    }
}
// A lake of a few nodes is a pond the land paints (and a stream); the views go to lakes of 40 nodes or more
const chosen = [...lakes.values()].filter(l => l.nodes >= 40).sort((a, b) => a.best.s - b.best.s);
const [first, count] = options.lakes || [0, chosen.length];
const stops = options.at ? options.at.map(s => ({ id: `s${s}`, best: { s }, y: null })) : chosen.slice(first, first + count);

const levelNow = () => (game.effectLevels || {}).water;
const setWater = level => Effects.apply(game, { ...(game.effectLevels || {}), water: level });
const draw = () => {
    // (the water builds one tile a frame: after it was turned off and on, every tile again)
    for (let i = 0; i < 60; i++) Effects.frame(game);
    game.graphics.render(game.scene, game.camera);
};
const snap = name => {
    draw();
    // WebP at most 1440 px across: a lake's views and its sequence in one page's answer
    const from = game.renderer.domElement, scale = Math.min(1, 1440 / from.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(from.width * scale); canvas.height = Math.round(from.height * scale);
    canvas.getContext('2d').drawImage(from, 0, 0, canvas.width, canvas.height);
    pictures[name] = canvas.toDataURL('image/webp', 0.9);
    const r = typeof Water !== 'undefined' ? Water.report(game) : null;
    views.push({ name, water: levelNow(), planar: r && r.planar, meshes: r && r.meshes, triangles: r && r.triangles });
};
const settle = async (s, mode) => {
    game.worldLinger = false;
    game.setCameraView(mode);
    await placeAt(s);
    document.querySelectorAll('#finishBanner').forEach(el => el.remove());
    game.worldCamera.reset(v.yawAngle);
    twistyDev.autopilot({ speed: 0 });
    for (let i = 0; i < 60; i++) twistyDev.step(1);
    env.streamer.pump(Infinity);
    // every water tile built (one a frame in a ride)
    for (let i = 0; i < 40; i++) Effects.frame(game);
    twistyDev.step(1, { render: true });
};
const both = name => {
    const level = levelNow();
    snap(`${name}-water`);
    setWater('off');
    snap(`${name}-before`);
    setWater(level);
};
const look = (eye, target, fov = 55) => {
    const cam = game.camera;
    cam.position.copy(eye);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    cam.lookAt(target);
    cam.updateMatrixWorld();
};
const sun = game.graphics.sunDirection;
game.waterTime = 100;
const out = [];
for (const lake of stops) {
    const s = lake.best.s;
    await settle(s, 'far');
    both(`lake${lake.id}-far`);
    await settle(s, 'near');
    both(`lake${lake.id}-near`);
    // Close: 6 m over the water at the bike's side of the lake, looking at the lake's middle, then toward the sun's side
    if (lake.nodes) {
        const mid = new THREE.Vector3(lake.sx / lake.nodes, lake.y, lake.sz / lake.nodes);
        const shore = new THREE.Vector3(lake.best.x, lake.y + 6, lake.best.z);
        const keep = { p: game.camera.position.clone(), q: game.camera.quaternion.clone(), fov: game.camera.fov };
        look(shore, mid.clone().setY(lake.y + 2));
        both(`lake${lake.id}-close`);
        const toSun = new THREE.Vector3(sun.x, 0, sun.z).normalize().multiplyScalar(200).add(shore).setY(lake.y);
        look(shore, toSun);
        both(`lake${lake.id}-sun`);
        // The motion: the close view, the waves stepped 0.25 s a frame
        look(shore, mid.clone().setY(lake.y + 2));
        for (let f = 0; f < (options.frames || 8); f++) {
            game.waterTime = 100 + f * 0.25;
            snap(`lake${lake.id}-motion-${String(f).padStart(2, '0')}`);
        }
        game.waterTime = 100;
        game.camera.position.copy(keep.p); game.camera.quaternion.copy(keep.q); game.camera.fov = keep.fov; game.camera.updateProjectionMatrix();
    }
    out.push({ lake: lake.id, s, nodes: lake.nodes, distance: lake.best.d === undefined ? null : Math.round(lake.best.d) });
}
game.waterTime = undefined;
return { lakes: out, views, report: typeof Water !== 'undefined' ? Water.report(game) : null, pictures };
