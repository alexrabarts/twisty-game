/**
 * @jest-environment node
 */
// A lowside as it is drawn (Vehicle.drawFall, Vehicle.FALL). Before, the bike lay on its side in the frame the crash
// was called, with the rider still in the seat. Now it goes down over time from the lean it had, turns into the bend
// as it slides, and the rider comes off and drops behind it on the line of the slide. The crash, the slide of the
// bike and the restart are the physics', unchanged. The real Vehicle on a flat plane.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';

const DT = 1 / 60;
const game = loadGame();
const { Vehicle, THREE } = game;
const FALL = Vehicle.FALL;

function bike(speed = 20) {
    const v = new Vehicle(new THREE.Scene(), null, game.CHARACTERS[0], undefined, { model: false });
    v.environment = { physics: game.WorldPhysics };
    v.speed = speed;
    return v;
}
// Rides into a bend for a second, then crashes as `fall` says; the frames after the crash for `seconds`
function crash(fall, { speed = 20, steer = 1, seconds = 4 } = {}) {
    const v = bike(speed);
    for (let i = 0; i < 60; i++) { v.speed = speed; v.update(DT, steer, 0.5, 0, 0); }
    const lean = v.leanAngle, heading = v.yawAngle, from = v.position.clone();
    v.worldCrash('test', fall);
    const frames = [];
    for (let i = 0; i < seconds * 60; i++) {
        v.update(DT, 0, 0, 0, 0);
        v.group.updateMatrixWorld(true);
        frames.push({
            roll: v.group.rotation.z, yaw: v.group.rotation.y - heading, speed: v.speed, at: v.position.clone(), y: v.group.position.y - v.position.y,
            rider: v.rider.getWorldPosition(new THREE.Vector3())
        });
    }
    return { v, lean, heading, from, frames };
}
// Metres of `p` ahead of `q` along a heading
const ahead = (p, q, heading) => (p.x - q.x) * Math.sin(heading) + (p.z - q.z) * Math.cos(heading);

describe('a lowside is drawn as it happens', () => {
    test('the bike goes down over time from the lean it had, and is on its side when it has', () => {
        for (const steer of [1, -1]) {
            const { lean, frames } = crash('lowside', { steer });
            const side = Math.sign(lean);
            expect(Math.abs(lean)).toBeGreaterThan(0.3);
            // The first frame is near the lean it crashed at, not on its side
            expect(Math.abs(frames[0].roll - lean)).toBeLessThan(0.05);
            for (let i = 1; i < frames.length; i++) expect(frames[i].roll * side).toBeGreaterThanOrEqual(frames[i - 1].roll * side - 1e-9);
            const half = frames[Math.round(FALL.downS / 2 / DT)].roll * side;
            expect(half).toBeGreaterThan(Math.abs(lean));
            expect(half).toBeLessThan(Math.PI / 2 - 0.3);
            expect(frames[Math.ceil(FALL.downS / DT)].roll * side).toBeCloseTo(Math.PI / 2, 6);
            expect(frames[frames.length - 1].y).toBeCloseTo(0.3, 6);
        }
    });

    test('it slides on along its line and stops, turning into the bend as it goes', () => {
        const { lean, heading, from, frames } = crash('lowside');
        const last = frames[frames.length - 1];
        expect(ahead(last.at, from, heading)).toBeGreaterThan(8);
        expect(last.speed).toBeLessThan(2);
        for (let i = 1; i < frames.length; i++) expect(ahead(frames[i].at, frames[i - 1].at, heading)).toBeGreaterThanOrEqual(0);
        // A bend to this side turns the bike against the sign of its lean; the rear comes round further
        const turn = -Math.sign(lean);
        expect(last.yaw * turn).toBeGreaterThan(0.4);
        expect(last.yaw * turn).toBeLessThanOrEqual(FALL.spinMax + 1e-9);
        for (let i = 1; i < frames.length; i++) expect(Math.abs(frames[i].yaw - frames[i - 1].yaw)).toBeLessThan(0.05);
    });

    test('the rider comes off and stops behind the bike on the line of the slide, on the ground, holding nothing', () => {
        const { v, heading, frames } = crash('lowside');
        const last = frames[frames.length - 1];
        const behind = -ahead(last.rider, last.at, heading);
        expect(behind).toBeGreaterThan(1);
        expect(behind).toBeLessThanOrEqual(FALL.riderLagMax + 1.5);
        expect(Math.abs(last.rider.y - last.at.y)).toBeLessThan(0.8);
        // He leaves the seat as the bike goes down, with no step
        for (let i = 1; i < frames.length; i++) expect(frames[i].rider.distanceTo(frames[i - 1].rider)).toBeLessThan(20 * DT * 1.5 + 0.05);
        for (const side of [-1, 1]) for (const limb of [v.arms[side], v.legs[side]]) expect(limb.at().distanceTo(limb.end)).toBe(0);
    });

    test('the physics is the crash as it was: the same slide, frame for frame, as a crash drawn the old way', () => {
        const drawn = crash('lowside'), plain = crash(null);
        drawn.frames.forEach((f, i) => {
            expect(f.at.toArray()).toEqual(plain.frames[i].at.toArray());
            expect(f.speed).toBe(plain.frames[i].speed);
        });
        expect(drawn.v.crashed).toBe(true);
        // And any other crash still lies on its side at once, the rider in the seat
        expect(Math.abs(plain.frames[0].roll)).toBeCloseTo(Math.PI / 2, 9);
        expect(plain.frames[0].yaw).toBeCloseTo(0, 9);
        expect(plain.v.rider.position.toArray()).toEqual(plain.v.riderBasePos.toArray());
    });

    test('a fall at walking pace goes over more slowly, and the rider stays with the bike', () => {
        const { lean, frames } = crash('tip', { speed: 0.5, seconds: 2 });
        const side = Math.sign(lean) || 1;
        expect(frames[Math.round(FALL.downS / DT)].roll * side).toBeLessThan(Math.PI / 2 - 0.2);
        expect(frames[Math.ceil(FALL.tipS / DT)].roll * side).toBeCloseTo(Math.PI / 2, 6);
        const last = frames[frames.length - 1];
        expect(last.rider.distanceTo(last.at)).toBeLessThan(1.6);
    });

    test('riding again, the rider is back on the seat and the bike is drawn as it rides', () => {
        const { v } = crash('lowside');
        v.crashed = false;
        v.leanAngle = 0;
        v.speed = 10;
        v.update(DT, 0, 0.3, 0, 0);
        expect(v.fall).toBeNull();
        expect(v.rider.position.distanceTo(v.riderBasePos)).toBeLessThan(0.01);
        expect(v.rider.rotation.y).toBe(0);
        expect(Math.abs(v.group.rotation.z)).toBeLessThan(0.05);
        expect(v.group.rotation.y).toBeCloseTo(v.yawAngle, 9);
    });
});
