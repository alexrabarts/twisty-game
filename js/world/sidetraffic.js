// Traffic on the side roads in free roam: a car on each side road near the bike, driving out along it from its
// junction and back, on its own right-hand side, standing a while at each end. The ride's own traffic (js/traffic.js)
// keeps to the ride's lanes; these cars keep to a side road's rows (WorldGraph.chainFrom).
//
// The rules (RULE):
//   - a side road whose junction is within nearM of the bike gets a car once its rows are in, up to `most` cars; a car
//     further than farM from the bike goes
//   - it drives out lengthM (or to the road's end) at speedMs, laneM right of the road's middle, and stands waitS at
//     each end before it turns
//   - it never drives into the bike: with the bike ahead of it on its way (within yieldM ahead, within sideM across)
//     it brakes to a stand. So a bike that rides into a car rode into one that stood or drove away from it
//   - the bike inside a car's box (CONTACT's car box, the bike's half length over it) faster than hardMs crashes; slower
//     it stops against it
//   - the car stands on the drawn ground (ground(x, z)), as the bike does on a side road
class SideTraffic {
    static get RULE() {
        return Object.freeze({ nearM: 700, farM: 900, most: 4, lengthM: 400, speedMs: 9, laneM: 1.3, waitS: 3, brake: 4, gain: 1.5, yieldM: 22, sideM: 4, hardMs: 3, bikeHalfM: 0.7, everyS: 0.5 });
    }

    // `graph` the world's graph (sideStubs, junctions, chainFrom); `ground(x, z)` the drawn ground's height;
    // `make()` a new car's model (a THREE.Group), `drop(group)` takes one away; `size` the car's footprint
    // {length, width}; `seed` the draws of colour and start
    constructor(graph, ground, make, drop, size, seed = 1) {
        this.graph = graph;
        this.ground = ground;
        this.make = make;
        this.drop = drop;
        this.size = size;
        this.cars = [];
        this.clock = 0;
        this.state = seed >>> 0 || 1;
        this.stubs = [...graph.sideStubs()].map(([edgeId, node]) => {
            const junction = graph.junctions.find(j => j.node === node);
            return { edgeId, node, junction, at: null };
        });
    }

    random() {
        this.state = (Math.imul(this.state ^ (this.state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
        return this.state / 4294967296;
    }

    // A side road's way out from its junction: [{x, z, d}] with d the metres along it, or null until its rows are in
    pathOf(stub) {
        const chain = this.graph.chainFrom(stub.edgeId, stub.node, SideTraffic.RULE.lengthM);
        if (!chain || !chain.rows || chain.rows.length < 2) return null;
        let d = 0;
        const path = chain.rows.map((row, k) => {
            if (k) d += Math.hypot(row.x - chain.rows[k - 1].x, row.z - chain.rows[k - 1].z);
            return { x: row.x, z: row.z, d };
        });
        return d > 20 ? path : null;
    }

    // Where a car is at d along its path going `way` (1 out, -1 back): {x, z, heading}, laneM to its right
    poseAt(path, d, way, out = {}) {
        const end = path[path.length - 1].d;
        d = Math.max(0, Math.min(end, d));
        let k = 1;
        while (k < path.length - 1 && path[k].d < d) k++;
        const a = path[k - 1], b = path[k], t = (d - a.d) / Math.max(1e-6, b.d - a.d);
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        // (heading: forward is (sin h, cos h); its right is (-cos h, sin h))
        const heading = Math.atan2((b.x - a.x) * way, (b.z - a.z) * way);
        out.x = x - Math.cos(heading) * SideTraffic.RULE.laneM;
        out.z = z + Math.sin(heading) * SideTraffic.RULE.laneM;
        out.heading = heading;
        return out;
    }

    // The bike at `bike` ({position, speed, crashed, velocity}) after dt: the cars move. Returns 'crash' when the bike
    // rode into a car faster than hardMs, 'stop' when slower, else null
    step(bike, dt) {
        const R = SideTraffic.RULE, p = bike.position;
        this.clock -= dt;
        if (this.clock <= 0) {
            this.clock = R.everyS;
            this.cars = this.cars.filter((car) => {
                if (Math.hypot(car.x - p.x, car.z - p.z) <= R.farM) return true;
                this.drop(car.group);
                car.stub.car = null;
                return false;
            });
            for (const stub of this.stubs) {
                if (this.cars.length >= R.most) break;
                if (stub.car || !stub.junction) continue;
                const near = this.pathStart(stub);
                if (!near || Math.hypot(near.x - p.x, near.z - p.z) > R.nearM) continue;
                const path = stub.path || (stub.path = this.pathOf(stub));
                if (!path) continue;
                const end = path[path.length - 1].d;
                const car = { stub, path, d: this.random() * end, way: this.random() < 0.5 ? 1 : -1, speed: R.speedMs, waitS: 0, group: this.make(this.random()), x: 0, z: 0, heading: 0 };
                stub.car = car;
                this.cars.push(car);
            }
        }
        let hit = null;
        for (const car of this.cars) {
            this.drive(car, bike, dt);
            hit = this.contact(car, bike) || hit;
        }
        return hit;
    }

    pathStart(stub) {
        const j = stub.junction;
        if (stub.start) return stub.start;
        const path = stub.path || (stub.path = this.pathOf(stub));
        if (path) stub.start = path[0];
        return stub.start || (j && Number.isFinite(j.x) ? { x: j.x, z: j.z } : null);
    }

    drive(car, bike, dt) {
        const R = SideTraffic.RULE, end = car.path[car.path.length - 1].d;
        if (car.waitS > 0) {
            car.waitS -= dt;
            if (car.waitS <= 0) car.way = -car.way;
        } else {
            // The bike ahead on its way: it brakes to a stand
            const pose = this.poseAt(car.path, car.d, car.way, {});
            const fx = Math.sin(pose.heading), fz = Math.cos(pose.heading);
            const dx = bike.position.x - pose.x, dz = bike.position.z - pose.z;
            const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
            // (a fallen bike too: the car waits behind the fall)
            const blocked = ahead > 0 && ahead < R.yieldM && side < R.sideM;
            const want = blocked ? 0 : R.speedMs;
            car.speed = want < car.speed ? Math.max(want, car.speed - R.brake * dt) : Math.min(want, car.speed + R.gain * dt);
            car.d += car.way * car.speed * dt;
            if (car.d >= end || car.d <= 0) {
                car.d = Math.max(0, Math.min(end, car.d));
                car.speed = 0;
                car.waitS = R.waitS;
            }
        }
        const pose = this.poseAt(car.path, car.d, car.way, {});
        car.x = pose.x;
        car.z = pose.z;
        car.heading = pose.heading;
        const y = this.ground(pose.x, pose.z);
        car.group.position.set(pose.x, (Number.isFinite(y) ? y : car.group.position.y) + 0.32, pose.z);
        car.group.rotation.y = pose.heading;
    }

    // The bike in the car's box: a crash faster than hardMs, else it stops against the car's side
    contact(car, bike) {
        if (bike.crashed) return null;
        const R = SideTraffic.RULE, fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        const dx = bike.position.x - car.x, dz = bike.position.z - car.z;
        const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
        if (Math.abs(along) > this.size.length / 2 + R.bikeHalfM || Math.abs(side) > this.size.width / 2 + R.bikeHalfM / 2) return null;
        return (bike.speed || 0) > R.hardMs ? 'crash' : 'stop';
    }

    clear() {
        for (const car of this.cars) {
            this.drop(car.group);
            car.stub.car = null;
        }
        this.cars = [];
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { SideTraffic };
