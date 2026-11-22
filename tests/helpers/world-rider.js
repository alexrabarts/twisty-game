// A careful rider on a world slice in node: the real Vehicle and WorldRun on the streamed world, as Game runs them a
// fixed step at a time. `rider` is 'pilot' (the world autopilot of tools/autopilot.js: pure pursuit and a lean held by
// a proportional input) or 'keys' (a keyboard: full key or none past a deadband, a 0.15 s reaction, the key held to
// full lock in a hairpin, then the input ramp of js/input.js). `lane` is metres right of the centre line, 'inside'
// (the inside of each bend, 1.2 m from the edge), or a function of the ride distance and the vehicle that gives the metres; through a roadworks site the rider takes the open lane, as the
// autopilot does (Roadworks.pilotLane). The speed is held at `speed` with the throttle and brake; `speed` may be a
// function of the ride distance and the vehicle (advisedPace below). The lean the rider plans with is the bike's own limit (the vehicle's worldPhysics: the
// rider's daring, the mode and the tuning are in it). `character` and `bike` choose who rides (the first character on
// their first bike unless given), and `watch(vehicle, tick)` is called after every step. `wide` is a rider who uses the
// edge lean (WorldPhysics.edgeLean): the lean planned with is the bike's limit as it is now, near the outside edge too.
// Returns {crashed, cut, cause, s, lateral, half, speed, ticks, stations}: the first crash or cut-rule restart, or a
// clean ride; `ticks` the steps of 1/60 s ridden and `stations` the tick at which each station was passed. `most` is
// the most steps (300 s unless given: a whole stage needs more).
const DT = 1 / 60, G = 9.81;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export async function rideSpan(game, env, { s0, s1, rider = 'pilot', speed = 6, assist = 'normal', lane = 0, log = null, most = 60 * 300, character = null, bike = null, watch = null, wide = false }) {
    const { THREE, Vehicle, WorldRun } = game;
    const route = env.route, world = env.physics;
    const v = new Vehicle(new THREE.Scene(), null, character, bike);
    v.environment = env;
    const pace = typeof speed === 'function' ? speed : () => speed;
    v.assistLevel = assist;
    const start = route.sample(s0, {});
    const offset = typeof lane === 'number' ? lane : 0;
    v.position.set(start.x + Math.cos(start.heading) * offset, start.y, start.z - Math.sin(start.heading) * offset);
    v.yawAngle = start.heading;
    v.findNearestRoadSegment();
    v.speed = pace(s0, v);
    await env.streamer.settle({ x: start.x, z: start.z }, s0);
    const run = new WorldRun(route, env.stationGates, world);
    run.begin(s0);
    const aim = {};
    // With `wide` the rider leans as far as the bike lets it now: the edge lean of a bike that runs wide is in the plan
    const more = () => (wide && v.edgeLeanShare > 0 ? 1 + v.worldPhysics.edgeLean.extra * v.edgeLeanShare : 1);
    const capTan = () => Math.tan(Math.atan(Math.tan(v.worldPhysics.leanCapDeg * Math.PI / 180) * Math.max(0.01, v.worldMultipliers().lateralFriction))) * more();
    const reaction = [];
    let smooth = 0, settled = s0, ticks = 0;
    const stations = [];
    if (log) log.length = 0;
    for (let tick = 0; tick < most; tick++) {
        ticks = tick;
        const p = v.projection;
        const s = p.index >= 0 ? p.s : s0;
        if (s >= s1) break;
        if (Math.abs(s - settled) > 100) { await env.streamer.settle({ x: v.position.x, z: v.position.z }, s); settled = s; }
        env.updateBarriers(s);
        const reach = Math.max(5, Math.min(30, 3 + 0.7 * v.speed));
        route.sample(s + reach, aim);
        const own = typeof lane === 'function' ? lane(s, v) : lane === 'inside' ? Math.sign(route.curvatureAt(s + 2, 8)) * Math.max(0, aim.width / 2 - 1.2) : offset;
        // A careful rider does not ride into the closed lane of a roadworks site: its plant is solid
        const side = env.roadworks ? env.roadworks.pilotLane(s + reach, own) : own;
        const tx = aim.x + Math.cos(aim.heading) * side, tz = aim.z - Math.sin(aim.heading) * side;
        const err = wrap(Math.atan2(tx - v.position.x, tz - v.position.z) - v.yawAngle);
        const most = Math.min(more() / world.radiusFloor, G * capTan() / Math.max(1, v.speed * v.speed));
        const wanted = Math.max(-most, Math.min(most, 2 * Math.sin(err) / reach));
        const lean = -Math.sign(wanted) * Math.atan(v.speed * v.speed * Math.abs(wanted) / G);
        let input = Math.max(-1, Math.min(1, (v.leanAngle - lean) * 8));
        if (rider === 'keys') {
            let key = input > 0.3 ? 1 : input < -0.3 ? -1 : 0;
            const tight = Math.max(Math.abs(route.curvatureAt(s, 6)), Math.abs(route.curvatureAt(s + 4, 6)));
            if (tight > 1 / 12 && Math.abs(input) > 0.1) key = Math.sign(input);
            reaction.push(key);
            key = reaction.length > 9 ? reaction.shift() : 0;
            smooth += (key - smooth) * 0.4;
            input = smooth;
        }
        const before = v.speed;
        const target = pace(s, v);
        v.update(DT, input, v.speed < target ? 1 : 0, v.speed > target + 1 ? 1 : 0, 0);
        if (watch) watch(v, tick);
        const q = v.projection;
        const at = { s: Math.round(q.s * 10) / 10, lateral: Math.round(q.lateral * 100) / 100, half: Math.round(q.width / 2 * 100) / 100, speed: Math.round(before * 100) / 100 };
        if (v.crashed) {
            const line = log ? log.filter(l => /CRASH/.test(l)).pop() : null;
            return { crashed: true, cut: false, cause: line || (v.lowsideTimerMs >= world.lowsideMs ? 'lowside' : 'crash'), ...at };
        }
        const result = q.index >= 0 ? run.update({ s: q.s, lateral: q.lateral, width: q.width, speed: v.speed, dt: DT, forwardDot: Math.cos(v.yawAngle - q.heading), land: !!v.runoff }) : null;
        if (result && result.cut) return { crashed: false, cut: true, cause: 'cut rule: a restart', ...at };
        if (result && result.station >= 0) stations.push({ index: result.station, tick: tick + 1 });
        if (run.finished) { ticks = tick + 1; break; }
    }
    return { crashed: false, cut: false, cause: null, s: Math.round(v.projection.s), ticks, stations };
}

// The pace of a rider who follows the speed advice: `cruise` on the open road, and for the next tight bend the advised
// speed (WorldAssist.advice, as the HUD shows it), braked for from where the bike's own brake reaches it. The brake
// the rider counts on is the least the bike has on this surface (Vehicle.worldBrakeLeast: its brake at full lean), so
// a weaker brake makes the rider brake sooner, by the physics' own numbers
export function advisedPace(game, env, cruise) {
    const least = (v, world, m) => (typeof v.worldBrakeLeast === 'function' ? v.worldBrakeLeast(m) : v.tuned('brakeForce') * world.brakeGain * m.brakeForce * world.trailBrakeFloor);
    return (s, v) => {
        const world = v.worldPhysics, m = v.worldMultipliers();
        const brake = least(v, world, m);
        const advice = game.WorldAssist.advice(env.route, world, s, Math.max(40, cruise * cruise / (2 * brake) + cruise * 1.5), m.lateralFriction);
        if (!advice) return cruise;
        return Math.min(cruise, Math.sqrt(advice.speed * advice.speed + 2 * brake * Math.max(0, advice.bend.distance - v.speed * 0.5)));
    };
}
