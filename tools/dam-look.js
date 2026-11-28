// A world-look script (tools/terrain-check.mjs world-look --script tools/dam-look.js): pictures of each dam of the
// world (js/world/dams.js) from the ride where it is nearest, from below its downstream foot and along its crest.
// `window.damLook` may set {poses: [...]} (the poses of a run with the dams, for a picture of the same place where the
// page has none: the land as it was), {ids: [...]} the dams to take, {near: true} the near chase too.
const opts = window.damLook || {};
const env = game.environment, route = env.route;
const pictures = {}, said = { dams: [] };
const grab = name => { pictures[name] = game.graphics.renderer.domElement.toDataURL('image/png'); };
document.querySelectorAll('body *').forEach(el => { if (el.tagName !== 'CANVAS' && !el.contains(game.graphics.renderer.domElement)) el.style.visibility = 'hidden'; });
game.worldLinger = false;
const look = (from, to) => ({
    bearing: Math.atan2(to[0] - from[0], -(to[2] - from[2])) * 180 / Math.PI,
    pitch: Math.atan2(to[1] - from[1], Math.hypot(to[0] - from[0], to[2] - from[2])) * 180 / Math.PI
});
const posesOf = dam => {
    const rows = dam.rows, mid = rows[Math.floor(rows.length / 2)];
    const at = (row, t, y) => [row.u[0] + row.a[0] * t, y, row.u[1] + row.a[1] * t];
    const centre = at(mid, mid.L / 2, (dam.crest + mid.zd) / 2);
    const poses = [];
    // from the ride, where it passes nearest
    let best = null;
    for (let s = 0; s < route.length; s += 10) {
        const p = route.sample(s, {});
        const d = Math.hypot(p.x - centre[0], p.z - centre[2]);
        if (!best || d < best.d) best = { s, d, p };
    }
    if (best) {
        const from = [best.p.x, best.p.y + 1.6, best.p.z];
        poses.push({ name: 'road', x: from[0], y: from[1], z: from[2], ...look(from, centre), vfov: Math.max(30, Math.min(70, 2 * Math.atan2((dam.data.length || 100) * 0.6, best.d) * 180 / Math.PI)) });
    }
    // from below: downstream of the middle row, out as far as the dam is high, 3 m over the land
    const out = Math.max(40, Math.min(220, (dam.crest - mid.zd) * 1.6 + 30));
    const bx = mid.u[0] + mid.a[0] * (mid.L + out), bz = mid.u[1] + mid.a[1] * (mid.L + out);
    const by = (env.ground.groundY(bx, bz, null) || mid.zd) + 3;
    poses.push({ name: 'below', x: bx, y: by, z: bz, ...look([bx, by, bz], at(mid, mid.L / 2, (dam.crest + mid.zd) / 2)), vfov: 60 });
    // along the crest from its first end
    const end = rows[Math.min(rows.length - 1, 2)];
    const c0 = at(end, Math.min(end.c1 / 2, end.L / 2), dam.crest + 1.7), c1 = at(rows[rows.length - 1], rows[rows.length - 1].c1 / 2, dam.crest + 1.7);
    poses.push({ name: 'crest', x: c0[0], y: c0[1], z: c0[2], ...look(c0, c1), vfov: 60 });
    return poses;
};
const dams = env.dams ? env.dams.dams : [];
const list = opts.poses || dams.map(d => ({ id: d.data.id, name: d.data.name, kind: d.kind, poses: posesOf(d) }));
for (const item of list) {
    if (opts.ids && !opts.ids.includes(item.id)) continue;
    for (const pose of item.poses) {
        await twistyDev.viewPose({ x: pose.x, y: pose.y, z: pose.z, bearing: pose.bearing, pitch: pose.pitch, vfov: pose.vfov });
        grab(`${item.id}-${pose.name}`);
    }
    said.dams.push({ id: item.id, name: item.name, kind: item.kind });
}
said.poses = list;
said.triangles = env.dams ? env.dams.triangles : null;
return { said, pictures };
