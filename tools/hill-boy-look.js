// The hill ride's boy close up, for hill-look: the boy posed on foot up the climb (from the climb's named shots and
// close views), on the pedals, legs out, a foot down, the throw and the fall, each picture written beside --out; and
// his cost: his triangles and draws, and the frame's GPU time from the chase camera with him drawn and hidden
// (.agent/system/hill.md, "The boy"):
//   node tools/terrain-check.mjs hill-look --gpu --script tools/hill-boy-look.js --out <dir>/hill-boy.png
const lane = ride.lane, bike = ride.bike, rider = ride.rider, cam = game.camera;
const pictures = {};
const said = { poses: [], boy: null, frame: null };
ride.hold = null;
ride.ending = null;
ride.climb = null;
if (ride.loafShown) ride.showLoaf(false);
const v = bike.vehicle;
// A pose: the bicycle at s (uphill or down), its state set, then drawn for `settle` seconds so the boy's own life
// (the blends, the breath, the swing of his clothes) has run
const pose = (o) => {
    bike.reset(o.s, o.across || 0);
    bike.rides = (bike.rides || 0) + 1;
    if (o.uphill) v.yawAngle += Math.PI;
    bike.walking = !!o.walk;
    bike.walkM = o.walkM || 0;
    v.speed = o.speed || 0;
    v.footDown = !!o.footDown;
    bike.legs = o.legs || 0;
    bike.legsOut = bike.legs > 0;
    bike.crank = o.crank || 0;
    rider.foot = o.footDown ? 1 : 0;
    if (o.throwSide && rider.throwAt) rider.throwAt(o.throwSide);
    const dt = 1 / 60;
    for (let t = 0; t < (o.settle || 0.5); t += dt) {
        if (o.walk && o.speed) bike.walkM += o.speed * dt;
        ride.draw(dt);
    }
};
// A picture from the rider's own frame: eye and target in his group's space (+x his left, +z ahead, y up)
const shoot = (name, eye, target, fov) => {
    rider.group.updateMatrixWorld(true);
    const e = rider.group.localToWorld(new THREE.Vector3().fromArray(eye));
    const t = rider.group.localToWorld(new THREE.Vector3().fromArray(target));
    cam.position.copy(e);
    cam.up.set(0, 1, 0);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    cam.lookAt(t);
    cam.updateMatrixWorld();
    if (game.effectLevels && typeof Effects !== 'undefined') Effects.frame(game);
    game.graphics.render(game.scene, cam);
    pictures[name] = game.renderer.domElement.toDataURL('image/png');
};
// A picture from one of the ride's named shots (HillRide.SHOTS)
const named = (name, shot) => {
    ride.forcedShot = shot;
    ride.placeCamera(1);
    ride.draw(0);
    pictures[name] = game.renderer.domElement.toDataURL('image/png');
    ride.forcedShot = null;
};
// The stills' moments (the owner's reference stills stay private: tools/hill-boy-sheet.mjs sets these beside them
// on this machine): per still, its index in the stills' folder by name, the shot, his pose, and his box in the still
// as shares of its video area. Each is drawn here with his box on the screen (his bones projected)
const STILLS = [
    { still: 1, shot: 'basket', pose: { s: 108.5, uphill: true, walk: true, walkM: 3.3 }, box: [0.36, 0.164, 0.759, 0.982] },
    { still: 2, shot: 'climbShop', pose: { s: 110, uphill: true, walk: true, walkM: 4.1 }, box: [0.543, 0.268, 0.737, 0.729] },
    { still: 3, shot: 'shopSide', pose: { s: 109.5, across: -0.3, uphill: true, walk: true, walkM: 5.0 }, box: [0.511, 0.298, 0.791, 0.908] },
    { still: 4, shot: 'shopSide', pose: { s: 109.5, across: -0.3, uphill: true, walk: true, walkM: 5.6 }, box: [0.441, 0.246, 0.84, 0.952] },
    { still: 5, shot: 'shopSide', pose: { s: 109.5, across: -0.3, uphill: true, walk: true, walkM: 6.25 }, box: [0.414, 0.149, 0.856, 0.982] },
    { still: 7, shot: 'opening', pose: { s: 30, speed: 7, legs: 1 }, box: [0.392, 0.484, 0.597, 0.893] },
    { still: 8, shot: 'opening', pose: { s: 38, speed: 7, legs: 1 }, box: [0.408, 0.513, 0.543, 0.848] }
];
said.stills = [];
for (const spec of STILLS) {
    const o = spec.pose;
    pose({ s: o.s, across: o.across, uphill: o.uphill, walk: o.walk, speed: o.walk ? 1.5 : o.speed, legs: o.legs, walkM: Math.max(0, (o.walkM || 0) - 1.2), settle: 0.8 });
    ride.forcedShot = spec.shot;
    ride.placeCamera(1);
    ride.draw(0);
    const p = new THREE.Vector3();
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const bone of rider.boy ? rider.boy.bones : Object.values(rider.parts)) {
        bone.getWorldPosition(p).project(cam);
        const sx = (p.x + 1) / 2, sy = (1 - p.y) / 2;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const mx = (x1 - x0) * 0.12 + 0.01, my = (y1 - y0) * 0.08 + 0.01;
    const name = `still-${String(spec.still + 1).padStart(2, '0')}-${spec.shot}`;
    pictures[name] = game.renderer.domElement.toDataURL('image/png');
    said.stills.push({ name, still: spec.still, stillBox: spec.box, gameBox: [Math.max(0, x0 - mx), Math.max(0, y0 - my), Math.min(1, x1 + mx), Math.min(1, y1 + my)] });
    ride.forcedShot = null;
}
const climb = { s: 109.5, across: -0.3, uphill: true, walk: true, speed: 1.5, walkM: 6.3, settle: 0.7 };
pose(climb);
named('boy-climb-shopSide', 'shopSide');
named('boy-climb-basket', 'basket');
shoot('boy-climb-side', [2.6, 1.1, 0.4], [0.3, 0.9, 0.1], 38);
shoot('boy-climb-front', [1.4, 1.35, 2.6], [0.35, 1.0, 0], 34);
shoot('boy-climb-head', [0.75, 1.45, 0.75], [0.3, 1.32, 0.15], 30);
shoot('boy-climb-hands', [0.15, 1.35, 0.9], [0.05, 1.0, 0.25], 40);
pose({ ...climb, walkM: 24, settle: 0.7 });
shoot('boy-climb-tired', [2.6, 1.1, 0.4], [0.3, 0.9, 0.1], 38);
pose({ ...climb, speed: 0, settle: 1.5 });
shoot('boy-stood', [2.4, 1.2, 1.4], [0.3, 0.9, 0], 38);
pose({ s: 130, speed: 6, crank: 0.7, settle: 0.6 });
shoot('boy-pedals-behind', [0.6, 1.7, -2.6], [0, 1.0, 0], 34);
shoot('boy-pedals-side', [-2.6, 1.1, 0.2], [0, 0.95, 0.1], 36);
shoot('boy-pedals-front', [-0.5, 1.45, 2.4], [0, 1.15, 0], 30);
shoot('boy-pedals-head', [-0.45, 1.6, 0.9], [0, 1.55, -0.05], 26);
// His face, looking at the camera: from ahead and to his left, and in profile
{
    rider.group.updateMatrixWorld(true);
    const own = ride.lookTarget, eye = rider.group.localToWorld(new THREE.Vector3(0.35, 1.62, 0.75));
    ride.lookTarget = () => eye;
    for (let i = 0; i < 40; i++) ride.draw(1 / 60);
    shoot('boy-portrait', [0.35, 1.62, 0.75], [0, 1.6, -0.03], 22);
    if (rider.boy) {
        // (a close look at his left eye and his mouth, from the portrait's eye)
        rider.group.updateMatrixWorld(true);
        const e = rider.boy.eyes[0].getWorldPosition(new THREE.Vector3()), from = rider.group.localToWorld(new THREE.Vector3(0.35, 1.62, 0.75));
        const near = (name, at, fov) => {
            cam.position.copy(from);
            cam.fov = fov;
            cam.updateProjectionMatrix();
            cam.lookAt(at);
            cam.updateMatrixWorld();
            if (game.effectLevels && typeof Effects !== 'undefined') Effects.frame(game);
            game.graphics.render(game.scene, cam);
            pictures[name] = game.renderer.domElement.toDataURL('image/png');
        };
        near('boy-eye', e, 5);
        near('boy-mouth', rider.boy.skull.localToWorld(new THREE.Vector3(0, 0.025, 0.11)), 7);
    }
    const ahead = rider.group.localToWorld(new THREE.Vector3(0, 1.6, 8));
    ride.lookTarget = () => ahead;
    for (let i = 0; i < 40; i++) ride.draw(1 / 60);
    shoot('boy-profile', [0.85, 1.6, 0.05], [0, 1.6, 0.0], 22);
    ride.lookTarget = () => eye;
    for (let i = 0; i < 40; i++) ride.draw(1 / 60);
    shoot('boy-three-quarter', [0.62, 1.66, 0.55], [0, 1.6, -0.03], 22);
    shoot('boy-three-quarter-r', [-0.62, 1.58, 0.6], [0, 1.6, -0.03], 22);
    shoot('boy-back', [0.25, 1.72, -0.8], [0, 1.6, -0.08], 24);
    ride.lookTarget = own;
}
// In play: the ride's own chase camera, rolling down the lane
pose({ s: 140, speed: 7, crank: 1.1, settle: 0.4 });
ride.view = 0;
ride.forcedShot = null;
for (let i = 0; i < 30; i++) { ride.placeCamera(1); ride.draw(1 / 60); }
pictures['boy-chase'] = game.renderer.domElement.toDataURL('image/png');
// The far body (past HillBoy.FAR.fromM) through a long lens, so its shape can be judged
if (rider.boy) rider.boy.level(rider.group.localToWorld(new THREE.Vector3(0.8, 2.4, -16)));
shoot('boy-far', [0.8, 2.4, -16], [0, 1.0, 0], 9);
shoot('boy-far-side', [-15.5, 1.6, 3], [0, 1.0, 0], 9);
pose({ s: 130, speed: 9, legs: 1, settle: 0.8 });
shoot('boy-legs-out-behind', [0.4, 1.5, -3.2], [0, 0.85, 0], 34);
shoot('boy-legs-out-front', [0.3, 1.3, 3.0], [0, 0.85, 0], 34);
pose({ s: 22, speed: 0, footDown: true, settle: 1.2 });
shoot('boy-foot-down', [-2.4, 1.3, 1.2], [0, 0.85, 0], 36);
if (rider.throwAt) {
    pose({ s: 160, speed: 8, throwSide: 1, settle: 0.25 });
    shoot('boy-throw', [-1.2, 1.6, 2.8], [0, 1.1, 0], 38);
}
// His cost: the triangles and the meshes of his body (the parts that leave the bicycle in a fall, and his head and
// apron), and the frame's GPU time from the chase camera with him drawn and hidden
const body = new Set(HillRider.BODY.concat(['head', 'apron_long', 'apron_hem']));
let triangles = 0, meshes = 0;
const seen = new Set();
rider.group.traverse(o => {
    if (!o.isMesh || seen.has(o) || !o.visible) return;
    let up = o, mine = false;
    while (up && up !== rider.group) { if (body.has(up.name) || up.userData.boy) mine = true; up = up.parent; }
    if (!mine) return;
    seen.add(o);
    const g = o.geometry, count = g.index ? g.index.count : g.attributes.position.count;
    const groups = g.groups && g.groups.length ? g.groups.length : 1;
    triangles += count / 3;
    meshes += groups;
});
said.boy = { triangles: Math.round(triangles), draws: meshes, near: rider.boy ? rider.boy.levels[0].mesh.geometry.index.count / 3 : null, far: rider.boy ? rider.boy.levels[1].mesh.geometry.index.count / 3 : null };
pose({ s: 130, speed: 8, crank: 0.4, settle: 0.3 });
ride.view = 0;
ride.forcedShot = null;
const gl = game.renderer.getContext(), pixel = new Uint8Array(4);
const time = (frames) => {
    const list = [];
    for (let i = 0; i < frames; i++) {
        ride.placeCamera(1);
        const t0 = performance.now();
        ride.draw(1 / 60);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        list.push(performance.now() - t0);
    }
    list.sort((a, b) => a - b);
    return +list[Math.floor(list.length / 2)].toFixed(2);
};
time(20);
pictures['boy-timing'] = game.renderer.domElement.toDataURL('image/png');
said.timingCameraM = +cam.position.distanceTo(rider.group.position).toFixed(1);
const info = game.renderer.info;
// (the frame is several passes: the counts are kept over the whole frame)
// (over two frames: the shadows are drawn every other frame)
const count = () => {
    info.autoReset = false;
    info.reset();
    ride.placeCamera(1);
    ride.draw(1 / 60);
    ride.placeCamera(1);
    ride.draw(1 / 60);
    const out = { calls: info.render.calls, triangles: info.render.triangles };
    info.autoReset = true;
    return out;
};
const all = count();
said.frame = { calls: all.calls, triangles: all.triangles, withBoyMs: time(80) };
const hide = [];
rider.group.traverse(o => { if (o.isMesh && (seen.has(o) || o.userData.boy)) { hide.push([o, o.visible]); o.visible = false; } });
// (the far body stays hidden while the near one is drawn)
said.frame.withoutBoyMs = time(80);
const less = count();
said.frame.callsWithout = less.calls;
said.frame.trianglesWithout = less.triangles;
hide.forEach(([o, was]) => { o.visible = was; });
said.maps = typeof HillBoyMaps !== 'undefined' && HillBoyMaps.made ? HillBoyMaps.made.ms : null;
said.frame.withBoyAgainMs = time(80);
// A fall: thrown off at speed, half a second into it and as he lies on the cobbles
{
    bike.reset(380);
    bike.rides = (bike.rides || 0) + 1;
    bike.walking = false;
    v.speed = 12;
    v.footDown = false;
    bike.legs = 0;
    rider.foot = 0;
    ride.draw(1 / 60);
    v.worldCrash('Too fast for the corner', null, 'grip');
    const dt = 1 / 120;
    for (let t = 0; t < 0.45; t += dt) { bike.step(dt, { pedal: 0, brake: 0, steer: 0 }); if (t % (1 / 60) < dt) ride.draw(1 / 60); }
    rider.group.updateMatrixWorld(true);
    const body = rider.parts.boy.getWorldPosition(new THREE.Vector3());
    const look = (name, off) => {
        cam.position.copy(body).add(off);
        cam.up.set(0, 1, 0);
        cam.fov = 40;
        cam.updateProjectionMatrix();
        cam.lookAt(body);
        cam.updateMatrixWorld();
        if (game.effectLevels && typeof Effects !== 'undefined') Effects.frame(game);
        game.graphics.render(game.scene, cam);
        pictures[name] = game.renderer.domElement.toDataURL('image/png');
    };
    look('boy-fall', new THREE.Vector3(2.4, 1.2, 1.6));
    for (let t = 0; t < 1.2; t += dt) { bike.step(dt, { pedal: 0, brake: 0, steer: 0 }); if (t % (1 / 60) < dt) ride.draw(1 / 60); }
    rider.parts.boy.getWorldPosition(body);
    look('boy-fallen', new THREE.Vector3(2.0, 1.3, 1.2));
}
said.size = [game.renderer.domElement.width, game.renderer.domElement.height];
said.pictures = pictures;
return said;
