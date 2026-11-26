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
export function groupRide(game, env, { rider, seed = 11, at = null, player = null, cars = false, seconds = 600, onFrame = null, until = null }) {
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
        for (let f = 0; f < 60 * seconds; f++) {
            const t = f * DT;
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
            if (until && until({ t, traffic, riders, proxy, playerS, overlaps })) break;
        }
        return { traffic, riders, proxy, overlaps, draws: drawn() - start };
    });
}

