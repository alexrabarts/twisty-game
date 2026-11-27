// A ride of a world's group (CrewGroup in js/traffic.js), shared by tests/unit/world-group.test.js and
// tests/unit/world-group-pace.test.js. Every ride is at 60 frames a second, with a seeded group (env.groupSeed) and the
// crew's start draws seeded (seeded), so each replays exactly.
import { boxOf, playerBox, depth, seeded, putAt } from './world-contact.js';

const DT = 1 / 60;
// A player position for the cars' old test when there is no player
const FAR = { x: 1e9, y: 0, z: 1e9 };

// A ride of the group. `rider` is the player's character (the crew is the rest); `at` puts the crew's riders at these
// ride distances by place (front first: the lowest place takes the first); `player` is {s, pace(t, s), drive}: a careful
// player on the lane line (it stops at red lights and never rides into what is on the road ahead of it), or none.
// `cars` keeps the world's car. `onFrame({t, traffic, riders, proxy, mine, playerS})` (`mine` the player as traffic reads it) sees each frame; the ride ends at
// `seconds` or when `until` says so. Returns {traffic, riders, proxy, overlaps, draws}.
// `frameS(k)` rides it as the game draws it: the k-th drawn frame lasts that many seconds, the ride steps at 60 a second
// as many times as the frames' time holds (0, 1 or more a frame), and each drawn frame puts traffic between its last two
// steps (Traffic.drawn) and calls `onDraw({t, alpha, traffic, riders, proxy, playerS, drawnPlayer})`, where drawnPlayer
// (and drawnYaw) is the player's position (and heading) drawn the same way (Vehicle.applyRenderInterpolation).
export function groupRide(game, env, { rider, seed = 11, at = null, player = null, cars = false, seconds = 600, onFrame = null, until = null, frameS = null, onDraw = null }) {
    const { THREE, Traffic, Roadworks } = game;
    const route = env.route, works = env.roadworks;
    const sOf = v => route.fromUnits(v.currentSegment + v.segmentProgress);
    const far = new THREE.Vector3(FAR.x, FAR.y, FAR.z);
    // The lights from the start of their cycles, so each ride meets them as the last one did
    works.reset();
    for (const site of works.closed) site.timer = null;
    works.occupied.clear();
    env.groupSeed = seed;
    return seeded(seed, (drawn) => {
        const traffic = new Traffic(new THREE.Scene(), env, rider.name);
        if (!cars) {
            traffic.cars.forEach(car => car.remove());
            traffic.cars = [];
        }
        const riders = traffic.motorcycles;
        const AIMotorcycle = riders[0].constructor;
        if (at) {
            const order = riders.slice().sort((a, b) => a.character.place - b.character.place);
            order.forEach((bike, k) => putAt(bike, route, at[k]));
        }
        let proxy = null, mine = null;
        if (player) {
            proxy = new AIMotorcycle(new THREE.Scene(), env, { direction: 1, speed: 0, startSegment: 0 });
            // (a player that takes its bends as a rider of the group does: `drive`, LANE_DRIVE's shape)
            if (player.drive) proxy.drive = { ...player.drive };
            putAt(proxy, route, player.s);
            mine = {
                position: proxy.bikeGroup.position, yawAngle: proxy.bikeGroup.rotation.y, speed: 0, crashed: false, isJumping: false,
                worldCrash() { this.crashed = true; }
            };
        }
        const start = drawn();
        const overlaps = [];
        const prevPlayer = new THREE.Vector3(), drawnPlayer = new THREE.Vector3();
        let prevYaw = 0, drawnYaw = 0;
        let f = 0, acc = 0, k = 0, done = false;
        const step = () => {
            const t = f * DT;
            if (proxy) { prevPlayer.copy(proxy.bikeGroup.position); prevYaw = proxy.bikeGroup.rotation.y; }
            works.step(DT);
            let playerS = null;
            if (proxy) {
                playerS = sOf(proxy);
                works.riderS = playerS;
                works.riderDirection = 1;
                proxy.baseSpeed = player.pace(t, playerS);
                let hold = works.stopDistance(proxy, playerS, 1, Roadworks.BIKE_HALF_M, proxy.currentSpeed, 5.4);
                for (const other of riders) {
                    if (!other.bikeGroup.visible || other.ride.aside) continue;
                    // (a rider passing it, out toward the centre line, is not in its way)
                    if (Math.abs(other.ride.off) > 1) continue;
                    const ahead = sOf(other) - playerS;
                    if (ahead > 0) hold = Math.min(hold, ahead - 2 * Roadworks.BIKE_HALF_M - Roadworks.QUEUE_GAP_M);
                }
                proxy.stopM = hold;
                proxy.update(DT, null, [proxy], []);
                mine.yawAngle = proxy.bikeGroup.rotation.y;
                mine.speed = proxy.currentSpeed;
                playerS = sOf(proxy);
            }
            traffic.update(DT, mine ? mine.position : far, null, mine);
            // Every pair of boxes, every frame
            const all = [...riders.filter(r => r.bikeGroup.visible), ...traffic.cars];
            const boxes = all.map(v => boxOf(v));
            if (mine) { all.push(mine); boxes.push(playerBox(mine)); }
            for (let i = 0; i < all.length; i++) {
                for (let j = i + 1; j < all.length; j++) {
                    if (Math.hypot(boxes[i].x - boxes[j].x, boxes[i].z - boxes[j].z) > 6) continue;
                    const deep = depth(boxes[i], boxes[j]);
                    if (deep > 0 && overlaps.length < 20) overlaps.push({ t: Math.round(t * 10) / 10, a: all[i].riderName || 'car/player', b: all[j].riderName || 'car/player', deep: Math.round(deep * 100) / 100 });
                }
            }
            if (onFrame) onFrame({ t, traffic, riders, proxy, mine, playerS, overlaps });
            if (until && until({ t, traffic, riders, proxy, playerS, overlaps })) done = true;
            f++;
            return playerS;
        };
        if (!frameS) {
            while (!done && f < 60 * seconds) step();
        } else {
            let playerS = null;
            while (!done && f < 60 * seconds) {
                acc += frameS(k++);
                traffic.stepped();
                while (!done && acc >= DT) {
                    playerS = step();
                    acc -= DT;
                }
                const alpha = acc / DT;
                traffic.drawn(alpha);
                if (proxy) {
                    drawnPlayer.lerpVectors(prevPlayer, proxy.bikeGroup.position, alpha);
                    let turn = proxy.bikeGroup.rotation.y - prevYaw;
                    if (turn > Math.PI) turn -= 2 * Math.PI;
                    else if (turn < -Math.PI) turn += 2 * Math.PI;
                    drawnYaw = prevYaw + turn * alpha;
                }
                if (onDraw) onDraw({ t: f * DT + acc, alpha, traffic, riders, proxy, playerS, drawnPlayer, drawnYaw });
            }
            traffic.stepped();
        }
        return { traffic, riders, proxy, overlaps, draws: drawn() - start };
    });
}

