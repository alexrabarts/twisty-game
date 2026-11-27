// A roadworks prop in a world ride, for world-look: the owner's view (the bike stopped behind it in the far chase,
// as at Tremola km 2.2), the near chase, and close views round it with a camera of the probe's own (rear three
// quarter, side, front three quarter, the cab through its glass, the tracks, from above); the pictures go into --out:
//   node tools/terrain-check.mjs world-look --world tremola --gpu --script tools/roadworks-look.js --out <dir>
const kind = 'digger';
const env = game.environment, v = game.vehicle, works = env.roadworks;
const all = (works.elements || []).filter(e => e.kind === kind);
if (!all.length) return { error: `no ${kind} on this ride` };
// The one nearest km 2.2 (the owner's)
const e = all.slice().sort((a, b) => Math.abs(a.s - 2200) - Math.abs(b.s - 2200))[0];
const pictures = {};
const settle = async (s, mode) => {
    game.worldLinger = false;
    game.setCameraView(mode);
    await placeAt(s);
    document.querySelectorAll('#finishBanner').forEach(el => el.remove());
    game.worldCamera.reset(v.yawAngle);
    twistyDev.autopilot({ speed: 0 });
    for (let i = 0; i < 90; i++) twistyDev.step(1);
    env.streamer.pump(Infinity);
    twistyDev.step(1, { render: true });
};
const snap = (name) => {
    game.graphics.render(game.scene, game.camera);
    pictures[name] = game.renderer.domElement.toDataURL('image/png');
};
// The prop's frame: its foot and yaw (its +z its front)
const at = (x, y, z) => {
    const c = Math.cos(e.yaw), s = Math.sin(e.yaw);
    return new THREE.Vector3(e.x + x * c + z * s, e.y + y, e.z - x * s + z * c);
};
const look = (name, eye, target, fov = 40) => {
    const cam = game.camera, keep = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
    const a = at(...eye), b = at(...target);
    cam.position.copy(a);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    cam.lookAt(b);
    cam.updateMatrixWorld();
    snap(name);
    cam.position.copy(keep.p);
    cam.quaternion.copy(keep.q);
    cam.fov = keep.fov;
    cam.updateProjectionMatrix();
};
// Behind it the way the ride goes, as the owner stopped (about 22 m back)
const back = e.s - 22;
await settle(back, 'far');
snap(`${kind}-owner-far`);
await settle(back + 12, 'near');
snap(`${kind}-owner-near`);
// Close round it, the bike moved on out of the frame: the diggers drawn at their levels for the probe's camera at
// the digger (lod0), not for the bike
await settle(e.s + 60, 'near');
if (works.placeDiggers) works.placeDiggers(e.x, e.z);
look(`${kind}-rear3q`, [2.6, 2.3, -4.2], [0, 1.0, 0]);
look(`${kind}-side`, [5.2, 1.6, 0], [0, 1.1, 0]);
look(`${kind}-front3q`, [-2.8, 2.2, 4.6], [0, 1.0, 0.2]);
look(`${kind}-cab`, [-1.6, 1.9, -1.4], [-0.1, 1.5, -0.3], 35);
look(`${kind}-tracks`, [2.2, 0.7, -2.4], [0.5, 0.3, 0], 35);
look(`${kind}-above`, [3.5, 6.5, -6.5], [0, 0.8, 0], 35);
// Each level from the same camera, the levels chosen as for a bike that far off (Roadworks.DIGGER_LOD_M)
if (works.placeDiggers) {
    for (const [level, off] of [[0, 0], [1, 60], [2, 150]]) {
        works.placeDiggers(e.x + off, e.z);
        look(`${kind}-lod${level}-rear3q`, [2.6, 2.3, -4.2], [0, 1.0, 0]);
    }
    works.placeDiggers(e.x, e.z);
}
return { pictures, element: { s: +e.s.toFixed(1), x: +e.x.toFixed(1), z: +e.z.toFixed(1), yaw: +e.yaw.toFixed(3) }, count: all.length };
