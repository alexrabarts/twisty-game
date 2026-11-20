// The boxes of the bikes and cars of a world ride, measured apart from the code under test, and a ride of the whole
// crew with a careful player among them (tests/unit/world-contact.test.js).
//
// A box is the vehicle's footprint in the ground plane: its length along its heading and its width across, about the
// model's origin (a bike's is midway between its wheels, a car's midway between its axles). The sizes are written out
// here, from the models (a bike: 1.4 m of wheelbase and two 0.3 m tyres, 0.8 m of bar; the car: 4.2 m by 1.9 m), so a
// change of the game's own table (Traffic.CONTACT) is judged by the picture and not by itself.
export const SIZE = { bike: { length: 2.1, width: 0.8 }, car: { length: 4.2, width: 1.9 } };

export function box(x, z, yaw, size) {
    return { x, z, yaw, halfLength: size.length / 2, halfWidth: size.width / 2 };
}

// The box of a traffic vehicle, from where its model stands
export function boxOf(vehicle) {
    const group = vehicle.carGroup || vehicle.bikeGroup;
    return box(group.position.x, group.position.z, group.rotation.y, vehicle.carGroup ? SIZE.car : SIZE.bike);
}

// The box of the player's bike ({position, yawAngle})
export function playerBox(player) {
    return box(player.position.x, player.position.z, player.yawAngle, SIZE.bike);
}

// How deep two boxes are in each other (metres along the axis of least overlap, of the four box axes), or 0 when a
// line passes between them. Two boxes that only touch are 0 deep
export function depth(a, b) {
    let least = Infinity;
    for (const box of [a, b]) {
        for (const quarter of [0, Math.PI / 2]) {
            const ax = Math.sin(box.yaw + quarter), az = Math.cos(box.yaw + quarter);
            const reach = o => o.halfLength * Math.abs(Math.sin(o.yaw) * ax + Math.cos(o.yaw) * az) + o.halfWidth * Math.abs(Math.cos(o.yaw) * ax - Math.sin(o.yaw) * az);
            const apart = Math.abs((b.x - a.x) * ax + (b.z - a.z) * az);
            least = Math.min(least, reach(a) + reach(b) - apart);
            if (least <= 0) return 0;
        }
    }
    return least;
}

// A seeded Math.random for the length of `run` (mulberry32), so the crew's paces and starts are the same every time.
// `run` is handed a function that tells how many draws were made so far
export function seeded(seed, run) {
    const random = Math.random;
    let a = seed >>> 0, draws = 0;
    Math.random = () => {
        draws++;
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try { return run(() => draws); } finally { Math.random = random; }
}

const sOf = (route, vehicle) => route.fromUnits(vehicle.currentSegment + vehicle.segmentProgress);

export function putAt(vehicle, route, s) {
    const u = route.toUnits(s);
    vehicle.currentSegment = Math.floor(u);
    vehicle.segmentProgress = u - Math.floor(u);
    vehicle.laneMoving = false;
    vehicle.updatePosition();
}

// The whole crew and the world's car over `metres` of the slice at 60 frames a second, with a careful player: a bike
// on the lane line at `pace(riders)` m/s that slows for each bend as the crew do, stops at a red light and never
// rides into what is ahead of it (it keeps the distance it can stop in). `place` is where the player starts in the
// grid: 'middle' (two riders behind it, three ahead) or 'front' (the whole crew behind it).
// Every frame every pair of boxes (riders, cars, the player) is measured. Returns
// `warmS` runs the lights on before the ride, so it meets them in another phase; `seconds` ends it by the clock.
// {frames, metres, overlaps (the first of them), count, pairs {kind: frames}, worst, redWaits, queue (the most of the
// crew and the player standing before one red light at once), sites, behind, events, draws (Math.random: `start` at
// the build, `ride` after it)}.
export function packRide(game, env, { metres = Infinity, seconds = 3600, place = 'middle', pace, seed = 7, warmS = 0, onFrame = null }) {
    const { THREE, Traffic, Roadworks } = game;
    const DT = 1 / 60;
    const route = env.route, works = env.roadworks;
    if (works) {
        works.reset();
        for (let t = 0; t < warmS; t += DT) works.step(DT);
    }
    return seeded(seed, (drawn) => {
        const traffic = new Traffic(new THREE.Scene(), env, game.CHARACTERS[0].name);
        const AIMotorcycle = traffic.motorcycles[0].constructor;
        const riders = traffic.motorcycles;
        const order = riders.slice().sort((a, b) => sOf(route, a) - sOf(route, b));
        const start = place === 'front' ? sOf(route, order[order.length - 1]) + 14 : (sOf(route, order[1]) + sOf(route, order[2])) / 2;
        const proxy = new AIMotorcycle(new THREE.Scene(), env, { direction: 1, speed: 10, startSegment: 0 });
        putAt(proxy, route, start);
        const player = {
            position: proxy.bikeGroup.position, yawAngle: 0, speed: 0, crashed: false, crashCause: null, isJumping: false,
            worldCrash(cause) { this.crashed = true; this.crashCause = cause; }
        };
        const stats = { frames: 0, metres: 0, overlaps: [], count: 0, pairs: {}, worst: 0, redWaits: 0, queue: 0, sites: new Set(), behind: Infinity, events: {}, causes: [], draws: { start: drawn(), ride: 0 } };
        const name = v => (v === player ? 'player' : v.carGroup ? 'car' : `rider ${v.riderName}`);
        const kind = v => (v === player ? 'player' : v.carGroup ? 'car' : 'rider');
        const from = sOf(route, proxy);
        for (let f = 0; f < 60 * seconds; f++) {
            const s = sOf(route, proxy);
            if (s - from >= metres || s >= env.endS - 30) break;
            if (works) {
                works.step(DT);
                works.riderS = s;
                works.riderDirection = 1;
                const site = works.siteAt(s);
                if (site) stats.sites.add(site.id);
            }
            // The careful player: the crew's pace, a stop at a red light, and room to stop behind whatever is ahead
            proxy.baseSpeed = pace(riders);
            let hold = works ? works.stopDistance(proxy, s, 1, Roadworks.BIKE_HALF_M, proxy.currentSpeed, 5.4) : Infinity;
            if (hold < 3 && proxy.currentSpeed < 0.1) stats.redWaits++;
            for (const other of riders) {
                if (!other.bikeGroup.visible) continue;
                const ahead = sOf(route, other) - s;
                if (ahead > 0) hold = Math.min(hold, ahead - 2 * Roadworks.BIKE_HALF_M - Roadworks.QUEUE_GAP_M);
            }
            proxy.stopM = hold;
            proxy.update(DT, null, [proxy], []);
            player.yawAngle = proxy.bikeGroup.rotation.y;
            player.speed = proxy.currentSpeed;
            const result = traffic.update(DT, player.position, null, player);
            if (result && result.rider) stats.events[result.rider.kind] = (stats.events[result.rider.kind] || 0) + 1;
            if (result && result.hit) stats.events.car = (stats.events.car || 0) + 1;
            if (player.crashed) { stats.causes.push({ s: Math.round(s), cause: player.crashCause }); player.crashed = false; }
            stats.frames++;
            const all = [...riders.filter(r => r.bikeGroup.visible), ...traffic.cars.filter(c => c.carGroup.visible), player];
            const boxes = all.map(v => (v === player ? playerBox(player) : boxOf(v)));
            for (let i = 0; i < all.length; i++) {
                for (let j = i + 1; j < all.length; j++) {
                    if (Math.hypot(boxes[i].x - boxes[j].x, boxes[i].z - boxes[j].z) > 6) continue;
                    const deep = depth(boxes[i], boxes[j]);
                    if (!(deep > 0)) continue;
                    const pair = [kind(all[i]), kind(all[j])].sort().join(' and ');
                    stats.count++;
                    stats.pairs[pair] = (stats.pairs[pair] || 0) + 1;
                    stats.worst = Math.max(stats.worst, deep);
                    if (stats.overlaps.length < 12) stats.overlaps.push({ f, s: Math.round(s), a: name(all[i]), b: name(all[j]), deep: Math.round(deep * 100) / 100, site: works && works.siteAt(s) ? works.siteAt(s).id : null });
                }
            }
            // The nearest a rider behind the player comes to it (metres of ride between the two origins)
            for (const other of riders) {
                const back = s - sOf(route, other);
                if (other.bikeGroup.visible && back > 0) stats.behind = Math.min(stats.behind, back);
            }
            if (works) {
                for (const site of works.closed) {
                    if (works.light(site, 1) !== 'red') continue;
                    const standing = [proxy, ...riders].filter(v => v.bikeGroup.visible && v.currentSpeed < 0.1 && site.stopIn - sOf(route, v) > 0 && site.stopIn - sOf(route, v) < 80).length;
                    stats.queue = Math.max(stats.queue, standing);
                }
            }
            if (onFrame) onFrame({ f, s, traffic, proxy, player, stats });
        }
        stats.metres = sOf(route, proxy) - from;
        stats.playerS = sOf(route, proxy);
        stats.draws.ride = drawn() - stats.draws.start;
        stats.sites = [...stats.sites];
        stats.end = riders.map(r => ({ name: r.riderName, s: Math.round(sOf(route, r)), speed: Math.round(r.currentSpeed * 10) / 10 }));
        return stats;
    });
}
