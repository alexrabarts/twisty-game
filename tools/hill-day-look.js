// The hill ride's day on the real page, for hill-look: an autopilot rides the climb, the restock and the descent,
// throws at each door, and the pictures of the climb, the restock, a throw and its delivery, the next door's lamp, the
// cart, the washing and the end card are written beside --out (.agent/system/hill.md, "The day"):
//   node tools/terrain-check.mjs hill-look --gpu --script tools/hill-day-look.js --out <dir>/hill-last.png
const lane = ride.lane, bike = ride.bike, input = game.input, day = ride.day;
const pictures = {};
const snap = name => { ride.draw(0); pictures[name] = game.renderer.domElement.toDataURL('image/png'); };
// A picture from a camera of the probe's own: eye and target as [s, across, up] on the lane
const look = (name, eye, target, fov = 40) => {
    const cam = game.camera, keep = { p: cam.position.clone(), fov: cam.fov };
    ride.draw(0);
    const e = lane.at(eye[0], eye[1], eye[2], {}), t2 = lane.at(target[0], target[1], target[2], {});
    cam.position.set(e.x, e.y, e.z);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    cam.lookAt(t2.x, t2.y, t2.z);
    cam.updateMatrixWorld();
    game.graphics.render(game.scene, cam);
    pictures[name] = game.renderer.domElement.toDataURL('image/png');
    cam.position.copy(keep.p);
    cam.fov = keep.fov;
    cam.updateProjectionMatrix();
};
const pilot = (dir, most) => {
    const v = bike.speed, ahead = lane.at(bike.s + dir * (4 + v * 0.6), dir < 0 ? -0.6 : 0, 0, {}), at = bike.vehicle.position;
    let err = Math.atan2(ahead.x - at.x, ahead.z - at.z) - bike.yaw;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    const turn = 2.2 * err * Math.max(1, v);
    const lean = -Math.atan(Math.max(0, v) * Math.max(-3, Math.min(3, turn / Math.max(1, v))) / 9.81);
    let limit = most;
    for (let d = 0; d <= 60; d += 2) if (Math.abs(lane.radiusAt(bike.s + dir * d)) < 30) limit = Math.min(limit, 8);
    return { steer: Math.max(-1, Math.min(1, (bike.lean - lean) * 5)), brake: v > limit ? 1 : 0 };
};
let now = { steer: 0, brake: 0 };
input.getThrottleInput = () => (now.brake ? 0 : 1);
input.getBrakeInput = () => now.brake;
input.getSteeringInput = () => now.steer;
input.getWheelieInput = () => 0;
ride.restart();
const said = { climb: null, restock: false, deliveries: [], events: [] };
let frames = 0, t = 0;
const step = () => { ride.frame(1 / 60); frames++; t += 1 / 60; };
// The climb: the steer keys turn him to his own left and right, as on the descent
while (ride.climb && frames < 60 * 60) {
    now = { steer: pilot(-1, Infinity).steer, brake: 0 };
    step();
    if (!pictures['hill-climb'] && ride.climb && bike.s < 52) snap('hill-climb');
    if (ride.climb && ride.climb.phase === 'restock' && ride.climb.t > 1.05 && !pictures['hill-restock']) snap('hill-restock');
}
said.climb = { seconds: +t.toFixed(1) };
said.restock = !!pictures['hill-restock'];
ride.view = 0;
let thrown = -1, throwAt = 0;
while (!(ride.ending && ride.ending.phase === 'done') && frames < 60 * 240) {
    now = pilot(1, 12);
    const next = day.next;
    if (next >= 0 && thrown !== next && day.running) {
        const d = day.doors[next];
        if (bike.s >= d.s - bike.speed * 0.75) { day.throw(d.side, bike); thrown = next; throwAt = t; }
    }
    step();
    if (thrown === 1 && !pictures['hill-throw'] && t - throwAt > 0.35) snap('hill-throw');
    if (thrown === 1 && !pictures['hill-throw-door'] && t - throwAt > 0.3) { const d = day.doors[1]; look('hill-throw-door', [d.s - 9, -d.side * 1.8, 1.7], [d.s - 1, d.side * 2.6, 0.9], 50); }
    if (thrown === 1 && !pictures['hill-delivered'] && day.states[1] === 'delivered' && t - throwAt > 0.9) { const d = day.doors[1]; look('hill-delivered', [d.s - 3, -d.side * 0.5, 1.6], [d.s, d.side * 3.8, 0.8], 45); }
    if (!pictures['hill-next-door'] && day.next === 2 && bike.s > day.doors[2].s - 40) { const d = day.doors[2]; look('hill-next-door', [d.s - 8, -d.side * 1.5, 1.7], [d.s, d.side * 3.9, 1.6], 45); }
    if (!pictures['hill-cart-near'] && bike.s > day.cart.s - 12) look('hill-cart-near', [day.cart.s - 9, 1.2, 1.7], [day.cart.s, day.cart.across, 1.2], 50);
    if (!pictures['hill-cart'] && bike.s > day.cart.s - 22) snap('hill-cart');
    if (!pictures['hill-washing'] && bike.s > 305 && day.washing.blow > 0.5) snap('hill-washing');
}
await new Promise(resolve => setTimeout(resolve, 3000));
said.states = day.states;
said.summary = day.summary();
said.board = { finishMs: ride.board.finishMs, restarts: ride.board.restarts };
said.card = ride.endNote.innerText;
said.pictures = pictures;
said.page = 'hill-end-card';
return said;
