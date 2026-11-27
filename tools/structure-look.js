// A world-look script (tools/terrain-check.mjs world-look --script tools/structure-look.js): pictures of the ride's
// structures for the structure rounds. The overpasses (another road's deck over the ride) from the chase view riding
// up to them and from the road beside a pier, and the ride's tunnels and galleries from 40 m out of a portal and from
// inside. `window.structureLook` may set {at: [s, ...] overpass stations, tubes: count, near: true}
const opts = window.structureLook || {};
const env = game.environment, route = env.route;
const pictures = {}, said = { overpasses: [], tubes: [] };
const grab = name => { pictures[name] = game.graphics.renderer.domElement.toDataURL('image/png'); };
const hide = () => document.querySelectorAll('body *').forEach(el => { if (el.tagName !== 'CANVAS' && !el.contains(game.graphics.renderer.domElement)) el.style.visibility = 'hidden'; });
hide();
game.worldLinger = false;
const chase = async (s, mode, name) => {
    game.setCameraView(mode);
    await placeAt(s);
    game.worldCamera.reset(game.vehicle.yawAngle);
    twistyDev.step(30, { render: false });
    twistyDev.step(1, { render: true });
    grab(name);
};
// (the side roads' decks: their piers, from every side road drawn now)
const piersNear = (x, z, reach) => {
    const out = [];
    env.sideGroup.traverse(o => { for (const p of (o.userData && o.userData.piers) || []) if (Math.hypot(p.x - x, p.z - z) < reach) out.push(p); });
    return out;
};
const stations = opts.at || [1640];
for (const s of stations) {
    await chase(s, 'far', `over-${s}-far`);
    await chase(s + 20, 'near', `over-${s + 20}-near`);
    const p = route.sample(s + 40, {});
    const piers = piersNear(p.x, p.z, 80).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    said.overpasses.push({ s, piers: piers.length, nearest: piers[0] ? { x: Math.round(piers[0].x), z: Math.round(piers[0].z), top: piers[0].top, foot: piers[0].foot } : null });
    if (piers[0]) {
        // From the ride's centre 18 m short of the pier, looking at its top
        const q = piers[0], at = route.project(q.x, q.z, null).s, from = route.sample(Math.max(5, at - 18), {});
        const bearing = Math.atan2(q.x - from.x, -(q.z - from.z)) * 180 / Math.PI;
        const pitch = Math.atan2(q.top - (from.y + 1.6), Math.hypot(q.x - from.x, q.z - from.z)) * 180 / Math.PI * 0.6;
        await twistyDev.viewPose({ x: from.x, z: from.z, eyeHeight: 1.6, bearing, pitch, vfov: 55 });
        grab(`over-${s}-pier`);
    }
}
// One deck of each style the side roads drawn near the ride have (StructureStyles.overpass, `pier.style`), from the ride
// nearest its pier, looking at it
if (opts.styles !== false) {
    const seen = new Set();
    for (const s of opts.sweep || [800, 1640, 2600, 3600, 4800, 6000, 7200, 8400, 9600]) {
        if (s > route.length) break;
        await placeAt(s);
        const piers = [];
        env.sideGroup.traverse(o => { for (const p of (o.userData && o.userData.piers) || []) if (p.style && !seen.has(p.style)) piers.push(p); });
        for (const q of piers) {
            if (seen.has(q.style)) continue;
            const at = route.project(q.x, q.z, null), on = at && route.sample(at.s, {});
            if (!on || Math.hypot(on.x - q.x, on.z - q.z) > 60) continue;
            seen.add(q.style);
            const from = route.sample(Math.max(5, at.s - 22), {});
            const bearing = Math.atan2(q.x - from.x, -(q.z - from.z)) * 180 / Math.PI;
            const pitch = Math.atan2(q.top - (from.y + 1.6), Math.hypot(q.x - from.x, q.z - from.z)) * 180 / Math.PI * 0.5;
            await twistyDev.viewPose({ x: from.x, z: from.z, eyeHeight: 1.6, bearing, pitch, vfov: 55 });
            grab(`style-${q.style}`);
            said.overpasses.push({ style: q.style, s: Math.round(at.s), x: Math.round(q.x), z: Math.round(q.z), height: Math.round(q.top - q.foot) });
        }
    }
}
// The walls named (opts.walls: ride metres), from the far chase
for (const s of opts.walls || [3880]) if (s < route.length) await chase(s, 'far', `wall-${s}-far`);
const tubes = [...route.ranges('tunnel').map(r => ({ ...r, kind: 'tunnel' })), ...route.ranges('gallery').map(r => ({ ...r, kind: 'gallery' }))].sort((a, b) => a.s0 - b.s0).slice(0, opts.tubes ?? 3);
for (const run of tubes) {
    said.tubes.push({ s0: Math.round(run.s0), s1: Math.round(run.s1), kind: run.kind });
    await chase(Math.max(10, run.s0 - 40), 'far', `tube-${Math.round(run.s0)}-portal`);
    await chase(run.s0 + Math.min(60, (run.s1 - run.s0) / 2), 'near', `tube-${Math.round(run.s0)}-inside`);
}
return { pictures, ...said };
