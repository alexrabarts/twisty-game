// Traffic on the side roads in free roam (js/world/sidetraffic.js; .agent/system/world.md, "Free roam"): a car on a
// side road near the bike once its rows are in, out and back on its own right-hand side, standing at each end; it
// brakes to a stand for the bike ahead of it, so it never drives into it; the bike that rides into it crashes when fast
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { SideTraffic } = new Function(`${readFileSync(`${root}js/world/sidetraffic.js`, 'utf8')}\nreturn { SideTraffic };`)();
const R = SideTraffic.RULE;
const size = { length: 4.4, width: 1.9 };

// One side road east from (0, 0), 200 m long, its rows in once `loaded`
function world() {
    const graph = {
        loaded: true,
        junctions: [{ node: 1, x: 0, z: 0 }],
        sideStubs: () => new Map([[9, 1]]),
        chainFrom: () => ({ rows: graph.loaded ? Array.from({ length: 21 }, (_, k) => ({ x: k * 10, z: 0 })) : [] })
    };
    const made = [], dropped = [];
    const group = () => ({ position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: { y: 0 } });
    const traffic = new SideTraffic(graph, () => 50, () => { const g = group(); made.push(g); return g; }, g => dropped.push(g), size, 3);
    return { graph, traffic, made, dropped };
}
const bikeAt = (x, z, speed = 0) => ({ position: { x, z }, speed, crashed: false });
const run = (traffic, bike, seconds) => { let hit = null; for (let t = 0; t < seconds; t += 1 / 60) hit = traffic.step(bike, 1 / 60) || hit; return hit; };

describe('side road traffic', () => {
    test('a car comes on a side road near the bike, once its rows are in, and goes when the bike is far', () => {
        const { graph, traffic, made, dropped } = world();
        graph.loaded = false;
        run(traffic, bikeAt(-500, 0), 1);
        expect(traffic.cars.length).toBe(0);
        graph.loaded = true;
        run(traffic, bikeAt(-500, 0), 1);
        expect(made.length).toBe(1);
        run(traffic, bikeAt(-2000, 0), 1);
        expect(traffic.cars.length).toBe(0);
        expect(dropped.length).toBe(1);
    });

    test('it drives out and back on its own right-hand side, at its speed, on the ground, standing at each end', () => {
        const { traffic } = world();
        const bike = bikeAt(-600, 0);
        run(traffic, bike, 0.6);
        const car = traffic.cars[0];
        car.d = 0;
        car.way = 1;
        car.speed = R.speedMs;
        run(traffic, bike, 5);
        // (east: its right is +z, forward x up, laneM off the middle)
        expect(car.z).toBeCloseTo(R.laneM, 6);
        expect(car.d).toBeGreaterThan(R.speedMs * 5 * 0.9);
        expect(car.group.position.y).toBeCloseTo(50.32, 6);
        car.d = 199;
        run(traffic, bike, 1);
        expect(car.waitS).toBeGreaterThan(0);
        run(traffic, bike, R.waitS + 2);
        expect(car.way).toBe(-1);
        expect(car.z).toBeCloseTo(-R.laneM, 6);
    });

    test('it brakes to a stand for the bike ahead of it, and never drives into it', () => {
        const { traffic } = world();
        const bike = bikeAt(-600, 0);
        run(traffic, bike, 0.6);
        const car = traffic.cars[0];
        car.d = 20;
        car.way = 1;
        car.speed = R.speedMs;
        // (the bike standing on the car's side of the road, 40 m on)
        bike.position = { x: 60, z: R.laneM };
        const hit = run(traffic, bike, 15);
        expect(hit).toBe(null);
        expect(car.speed).toBe(0);
        expect(60 - car.x).toBeGreaterThan(size.length / 2 + R.bikeHalfM);
    });

    test('the bike that rides into a car crashes when fast, and stops against it when slow', () => {
        const { traffic } = world();
        run(traffic, bikeAt(-600, 0), 0.6);
        const car = traffic.cars[0];
        expect(traffic.contact(car, bikeAt(car.x + 1, car.z, 8))).toBe('crash');
        expect(traffic.contact(car, bikeAt(car.x + 1, car.z, 1))).toBe('stop');
        expect(traffic.contact(car, bikeAt(car.x, car.z + 3, 8))).toBe(null);
    });
});
