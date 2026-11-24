/**
 * @jest-environment node
 */
// The hill ride (js/hill/): opened by its address key alone (RideMode, js/ridemode.js), down a cobbled village lane
// (HillLane) on a delivery bicycle (HillBicycle) with the boy on it (HillRider, assets/hill/bicycle.glb), to a brass
// band (HillMusic). The physics and the lane run here as the page runs them; the pose is the real model's.
import { describe, test, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const THREE = realThree();
const RideMode = new Function(`${loadScript('ridemode.js')}\nreturn RideMode;`)();
const { HillLane, HillBicycle, HillMusic } = new Function(
    `${loadScript('hill/lane.js')}\n${loadScript('hill/bicycle.js')}\n${loadScript('hill/music.js')}\nreturn { HillLane, HillBicycle, HillMusic };`
)();

const DT = 1 / 120;
const quiet = { pedal: 0, brake: 0, steer: 0 };
// A flat lane: the same lane with no fall and no bend
const flat = () => new HillLane({ ...HillLane.RULE, grade: [[0, 0], [1, 0]], heading: [[0, 0], [1, 0]] });
const ride = (bike, input, seconds) => {
    for (let t = 0; t < seconds; t += DT) bike.step(DT, input);
};

describe('the address', () => {
    test('its key opens the hill ride at once, before any other mode, and nothing else changes', () => {
        const key = RideMode.HILL_KEY;
        expect(RideMode.resolve(`?${key}`)).toEqual({ kind: 'hill', world: null, direct: true });
        expect(RideMode.resolve(`?world=tremola&${key}`)).toEqual({ kind: 'hill', world: null, direct: true });
        expect(RideMode.resolve('?legs')).toEqual({ kind: 'legs', world: null, direct: false });
        expect(RideMode.resolve('')).toEqual({ kind: 'world', world: 'tremola', direct: false });
    });

    test('the key is written in js/ridemode.js and nowhere else in the game, the tools or the assets', () => {
        const key = RideMode.HILL_KEY.toLowerCase();
        const found = [];
        const walk = dir => {
            for (const name of readdirSync(dir)) {
                const path = join(dir, name);
                const where = relative(root, path);
                if (name.toLowerCase().includes(key)) found.push(where);
                if (statSync(path).isDirectory()) walk(path);
                else if (/\.(js|mjs|py|html|css|json)$/.test(name) && readFileSync(path, 'utf8').toLowerCase().includes(key)) found.push(where);
            }
        };
        for (const dir of ['js', 'tools', 'assets']) walk(join(root, dir));
        if (readFileSync(join(root, 'index.html'), 'utf8').toLowerCase().includes(key)) found.push('index.html');
        expect(found).toEqual(['js/ridemode.js']);
    });
});

describe('the lane', () => {
    const lane = new HillLane();

    test('is the same on every load', () => {
        const again = new HillLane();
        expect(again.points).toEqual(lane.points);
        expect(again.cottages).toEqual(lane.cottages);
        expect(again.buttresses).toEqual(lane.buttresses);
    });

    test('falls all the way, steeply in its middle, and runs out flat at the bottom where it bends towards the cottages', () => {
        const grades = lane.points.map(p => p.grade);
        expect(Math.max(...grades)).toBeLessThanOrEqual(0);
        expect(Math.min(...grades)).toBeLessThan(-0.18);
        expect(Math.min(...grades)).toBeGreaterThan(-0.25);
        expect(lane.points[lane.points.length - 1].grade).toBeCloseTo(0, 6);
        expect(lane.rule.topY - lane.bottomY).toBeGreaterThan(20);
        const end = lane.sample(lane.rule.lengthM);
        expect(end.heading).toBeGreaterThan(0.3);
        expect(end.x).toBeGreaterThan(20);
        // The ride's part is a fall from its start to its end
        expect(lane.sample(lane.rule.startM).y - lane.sample(lane.rule.endM).y).toBeGreaterThan(20);
    });

    test('its cottages stand end to end along it without overlapping, none before the start of the ride', () => {
        for (let i = 1; i < lane.cottages.length; i++) expect(lane.cottages[i].from).toBeGreaterThanOrEqual(lane.cottages[i - 1].to - 1e-9);
        expect(lane.cottages[0].from).toBeLessThanOrEqual(0);
        expect(lane.cottages[lane.cottages.length - 1].to).toBeGreaterThanOrEqual(lane.rule.lengthM);
        for (const c of lane.cottages) {
            expect(c.wide).toBeGreaterThanOrEqual(lane.rule.cottageWide[0]);
            expect(c.foot).toBeLessThan(Math.min(lane.sample(c.from).y, lane.sample(c.to).y));
        }
    });

    test('its cobbles are low domes: none under the lane, none higher than a sett stands, nothing at a joint', () => {
        const r = lane.rule;
        let most = 0, sum = 0, n = 0;
        for (let s = 0; s < 20; s += 0.013) {
            for (let a = -2.5; a < 2.5; a += 0.017) {
                const h = lane.cobble(s, a);
                expect(h).toBeGreaterThanOrEqual(0);
                expect(h).toBeLessThanOrEqual(r.settUpM + 1e-12);
                most = Math.max(most, h);
                sum += h;
                n++;
            }
        }
        expect(most).toBeGreaterThan(r.settUpM * 0.95);
        expect(sum / n).toBeGreaterThan(r.settUpM * 0.3);
        expect(lane.cobble(r.settLongM * 3, 0.3)).toBe(0);
    });
});

describe('the bicycle', () => {
    test('stood at the top it rolls off on the fall alone, the legs come out at speed, and it stops past the end', () => {
        const bike = new HillBicycle(new HillLane());
        const r = bike.rule;
        expect(bike.s).toBe(bike.lane.rule.startM);
        let outAt = null, top = 0, cranks = 0;
        for (let t = 0; t < 90 && !(bike.finished && bike.speed === 0); t += DT) {
            bike.step(DT, quiet);
            top = Math.max(top, bike.speed);
            cranks = Math.max(cranks, bike.crank);
            if (outAt === null && bike.legs >= 1) outAt = { s: bike.s, speed: bike.speed };
        }
        expect(outAt).not.toBeNull();
        expect(outAt.speed).toBeGreaterThan(r.legsOutMs);
        expect(outAt.s).toBeLessThan(80);
        // Fast enough to be a thrill and slow enough to be a boy on a heavy bicycle
        expect(top).toBeGreaterThan(10);
        expect(top).toBeLessThan(17);
        expect(bike.finished).toBe(true);
        expect(bike.speed).toBe(0);
        expect(bike.s).toBeLessThan(bike.lane.rule.lengthM);
        // Never pedalled: the cranks never turned
        expect(cranks).toBe(0);
        // Stopped, his feet are back on the pedals
        ride(bike, quiet, 1);
        expect(bike.legs).toBe(0);
    });

    test('pedalled on the flat it reaches a pace under the most his feet can turn, and no faster', () => {
        const bike = new HillBicycle(flat());
        bike.reset(0);
        let cadence = 0;
        for (let t = 0; t < 40; t += DT) {
            bike.step(DT, { pedal: 1, brake: 0, steer: 0 });
            cadence = Math.max(cadence, bike.cadenceRpm);
            if (bike.s > 150) bike.s = 10;
        }
        expect(bike.speed).toBeGreaterThan(3.5);
        expect(bike.speed).toBeLessThan(bike.pedalMostMs);
        expect(cadence).toBeLessThan(bike.rule.cadenceMostRpm);
        expect(bike.legs).toBe(0);
    });

    test('past the most his feet can turn, the pedals push nothing and the cranks stand on the freewheel', () => {
        const bike = new HillBicycle(flat());
        bike.reset(0);
        bike.speed = bike.pedalMostMs + 1;
        const crank = bike.crank;
        bike.step(DT, { pedal: 1, brake: 0, steer: 0 });
        expect(bike.pushing).toBe(false);
        expect(bike.cadenceRpm).toBe(0);
        expect(bike.crank).toBe(crank);
        expect(bike.speed).toBeLessThan(bike.pedalMostMs + 1);
    });

    test('the rod brakes slow it weakly: about their own pull with the drag added', () => {
        const bike = new HillBicycle(flat());
        bike.reset(0);
        bike.speed = 8;
        bike.step(DT, { pedal: 0, brake: 1, steer: 0 });
        const decel = (8 - bike.speed) / DT;
        expect(decel).toBeGreaterThan(bike.rule.brakeMs2);
        expect(decel).toBeLessThan(bike.rule.brakeMs2 + 1.1);
    });

    test('the legs stay out while it is too fast for his feet, and come in once it slows', () => {
        const bike = new HillBicycle(flat());
        bike.reset(0);
        bike.speed = 9;
        bike.legsOut = true;
        bike.legs = 1;
        ride(bike, { pedal: 1, brake: 0, steer: 0 }, 0.2);
        expect(bike.legsOut).toBe(true);
        let back = null;
        for (let t = 0; t < 20 && back === null; t += DT) {
            bike.step(DT, { pedal: 0, brake: 1, steer: 0 });
            if (!bike.legsOut) back = bike.speed;
        }
        expect(back).toBeLessThan(bike.rule.legsInMs);
        ride(bike, quiet, bike.rule.legsBlendS + 0.05);
        expect(bike.legs).toBe(0);
    });

    test('the cobbles shake it as it rolls, no higher than a sett stands', () => {
        const bike = new HillBicycle(flat());
        bike.reset(0);
        bike.speed = 6;
        const seen = new Set();
        for (let t = 0; t < 3; t += DT) {
            bike.speed = 6;
            bike.step(DT, quiet);
            expect(bike.bounce).toBeGreaterThanOrEqual(0);
            expect(bike.bounce).toBeLessThanOrEqual(bike.lane.rule.settUpM);
            seen.add(Math.round(bike.bounce * 1e4));
        }
        expect(seen.size).toBeGreaterThan(10);
    });

    test('steered hard it crosses the lane and stops at its edge', () => {
        const bike = new HillBicycle(flat());
        bike.reset(0);
        for (let t = 0; t < 10; t += DT) {
            bike.speed = 5;
            bike.step(DT, { pedal: 0, brake: 0, steer: 1 });
        }
        expect(bike.across).toBeCloseTo(bike.lane.rule.halfWidthM - bike.rule.edgeM, 9);
        expect(bike.lean).toBeLessThan(0);
    });
});

describe('the music', () => {
    test('is the Largo theme, its tune opening on the third, the fifth and the fifth of D flat major', () => {
        const { list, lengthS } = HillMusic.events();
        const tune = list.filter(e => e.voice === 'cornet');
        expect(tune.slice(0, 3).map(e => e.midi)).toEqual([65, 68, 68]);
        expect(tune.length).toBe(HillMusic.SCORE.tune.length);
        for (const e of list) {
            expect(e.midi).toBeGreaterThanOrEqual(30);
            expect(e.midi).toBeLessThanOrEqual(80);
            expect(e.at + e.durS).toBeLessThanOrEqual(lengthS);
        }
        expect(new Set(list.map(e => e.voice))).toEqual(new Set(['cornet', 'horn', 'tuba']));
    });
});

describe('the boy on the bicycle', () => {
    const fetch = async url => {
        const bytes = readFileSync(join(root, url));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const { SceneAssets, HillRider } = new Function('THREE', 'document', 'console', 'fetch', 'Blob', 'TextDecoder',
        `${loadScript('sceneassets.js')}\n${loadScript('hill/rider.js')}\nreturn { SceneAssets, HillRider };`)(THREE, canvasStub(), console, fetch, Blob, TextDecoder);
    const lane = new HillLane();
    const at = new THREE.Vector3();
    const world = (part, out = at) => {
        part.updateWorldMatrix(true, false);
        return out.setFromMatrixPosition(part.matrixWorld);
    };
    let rider;
    // A stand-in lane sample: the bicycle on flat ground at the origin, heading +z
    const still = { x: 0, y: 0, z: 0, heading: 0, grade: 0, leftX: 1, leftZ: 0 };
    const state = (crank, legs) => ({ speed: 0, across: 0, bounce: 0, pitch: 0, lean: 0, crank, legs });

    test('loads the model with every part the pose moves', async () => {
        rider = new HillRider(await SceneAssets.loadModel(HillRider.FILE));
        for (const name of ['wheel_front', 'wheel_rear', 'cranks', 'pedal_l', 'pedal_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r', 'boy', 'basket', 'plate']) {
            expect(rider.parts[name]).toBeTruthy();
        }
        expect(rider.legs.map(l => l.side).sort()).toEqual([-1, 1]);
    });

    test('pedalling, each ankle is on its pedal, the leg keeps its length and nothing goes into the ground', () => {
        const hip = new THREE.Vector3(), knee = new THREE.Vector3(), ankle = new THREE.Vector3(), pedal = new THREE.Vector3();
        for (let k = 0; k < 12; k++) {
            const crank = k / 12 * 2 * Math.PI;
            rider.update(state(crank, 0), still, 0);
            for (const leg of rider.legs) {
                world(leg.thigh, hip);
                world(leg.shin, knee);
                world(leg.foot, ankle);
                world(leg.pedalPart, pedal);
                expect(hip.distanceTo(knee)).toBeCloseTo(leg.upper, 4);
                expect(knee.distanceTo(ankle)).toBeCloseTo(leg.lower, 2);
                expect(ankle.distanceTo(pedal.clone().add(new THREE.Vector3().fromArray(HillRider.ANKLE_ON_PEDAL)))).toBeLessThan(0.02);
                expect(ankle.y).toBeGreaterThan(0.08);
                // The pedal stays level
                expect(leg.pedalPart.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-9);
            }
        }
    });

    test('legs out, each leg is straight out to its own side, below the hip and clear of the bicycle and the ground', () => {
        rider.update(state(0, 1), still, 0);
        const hip = new THREE.Vector3(), ankle = new THREE.Vector3();
        for (const leg of rider.legs) {
            world(leg.thigh, hip);
            world(leg.foot, ankle);
            expect(hip.distanceTo(ankle)).toBeGreaterThan((leg.upper + leg.lower) * 0.97);
            expect(Math.sign(ankle.x)).toBe(leg.side);
            expect(Math.abs(ankle.x)).toBeGreaterThan(0.55);
            expect(ankle.y).toBeLessThan(hip.y);
            expect(ankle.y).toBeGreaterThan(0.4);
        }
    });
});
