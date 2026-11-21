/**
 * @jest-environment node
 */
// How far each rider's body goes into a turn past the bike's own lean (CHARACTERS `bodyLean`, Vehicle.riderLean,
// Vehicle.BODY). One rider sits in line with the bike at any lean, one hangs off, the others are between. Before,
// every rider rolled a fifth of the bike's lean about the seat, and the hands and feet went with the body, off the
// grips and the pegs. Drawn only: the physics reads none of it. The real Vehicle on a flat plane.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';

const DT = 1 / 60;
const game = loadGame();
const { Vehicle, CHARACTERS, THREE } = game;
const who = id => CHARACTERS.find(c => c.id === id);

function bike(character, speed = 20) {
    const v = new Vehicle(new THREE.Scene(), null, character, undefined, { model: false });
    v.environment = {
        physics: game.WorldPhysics,
        route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade: 0, flags: {} }) }
    };
    v.speed = speed;
    return v;
}
// The bike drawn at a lean, with the bar straight
function drawn(character, lean) {
    const v = bike(character);
    v.leanAngle = lean;
    v.shownBar = () => 0;
    v.currentDeltaTime = DT;
    v.updateMesh();
    v.group.position.set(0, 0, 0);
    v.group.rotation.set(0, 0, 0);
    v.group.updateMatrixWorld(true);
    return v;
}
// Where the hands and the ankles are drawn, in the bike's axes
const ends = v => [-1, 1].flatMap(side => [v.arms[side], v.legs[side]].map(limb => limb.at().clone().applyMatrix4(v.rider.matrix)));

describe('each rider leans into a turn as that rider does', () => {
    test('every rider has a bodyLean from 0 to 1, in the order the riders really lean', () => {
        for (const c of CHARACTERS) {
            expect(c.bodyLean).toBeGreaterThanOrEqual(0);
            expect(c.bodyLean).toBeLessThanOrEqual(1);
        }
        const lean = id => who(id).bodyLean;
        expect(lean('shane')).toBe(0);
        expect(lean('steve')).toBeGreaterThan(lean('alex'));
        expect(lean('alex')).toBe(lean('tim'));
        expect(lean('alex')).toBe(lean('lucy'));
        expect(lean('alex')).toBeGreaterThan(lean('guy'));
        expect(lean('guy')).toBeGreaterThan(0);
    });

    test('at the same lean of the bike the body goes further in by that order, to both sides, and not at all for 0', () => {
        for (const lean of [0.6, -0.6]) {
            const side = Math.sign(lean);
            const at = Object.fromEntries(CHARACTERS.map(c => [c.id, drawn(c, lean).rider]));
            const roll = id => at[id].rotation.z * side, shift = id => -at[id].position.x * side;
            for (const amount of [roll, shift]) {
                expect(amount('steve')).toBeGreaterThan(amount('alex') * 1.5);
                expect(amount('alex')).toBeCloseTo(amount('tim'), 12);
                expect(amount('alex')).toBeCloseTo(amount('lucy'), 12);
                expect(amount('alex')).toBeGreaterThan(amount('guy') * 1.5);
                expect(amount('guy')).toBeGreaterThan(0);
                expect(Math.abs(amount('shane'))).toBe(0);
            }
            // The one who hangs off: the body rolls 10 degrees and more past the bike, and moves 10 cm and more across the seat
            expect(roll('steve')).toBeGreaterThan(0.17);
            expect(shift('steve')).toBeGreaterThan(0.1);
        }
        // Into the turn: a positive roll leans the bike to its right (-x), and the rider goes that way
        expect(Vehicle.riderLean(0.6, 1).shift).toBeLessThan(0);
        expect(Vehicle.riderLean(0.6, 1).roll).toBeGreaterThan(0);
        expect(Math.abs(Vehicle.riderLean(0, 1).roll) + Math.abs(Vehicle.riderLean(0, 1).shift)).toBe(0);
    });

    test('the hands stay on the grips and the feet on the pegs, however far the body goes', () => {
        for (const c of CHARACTERS) {
            const upright = ends(drawn(c, 0));
            for (const lean of [0.3, 0.87, -0.87]) {
                const v = drawn(c, lean);
                ends(v).forEach((end, i) => expect(end.distanceTo(upright[i])).toBeLessThan(0.001));
                // And no limb is stretched to get there by more than a tenth
                for (const side of [-1, 1]) for (const limb of [v.arms[side], v.legs[side]]) {
                    expect(limb.at().distanceTo(limb.root)).toBeLessThan(limb.reach * 1.1);
                }
            }
        }
    });

    test('a rider upright again is drawn as at the start', () => {
        const c = who('steve');
        const fresh = drawn(c, 0);
        const v = drawn(c, 0.8);
        v.leanAngle = 0;
        v.updateMesh();
        expect(v.rider.rotation.z).toBe(0);
        expect(v.rider.position.x).toBe(fresh.rider.position.x);
        ends(v).forEach((end, i) => expect(end.distanceTo(ends(fresh)[i])).toBeLessThan(1e-9));
    });

    test('less in the air; in a crash he comes off, and is back in line with the bike when it rides again', () => {
        const v = drawn(who('steve'), 0.6);
        const full = v.rider.rotation.z;
        v.isJumping = true;
        v.updateMesh();
        expect(v.rider.rotation.z).toBeGreaterThan(0);
        expect(v.rider.rotation.z).toBeLessThan(full);
        v.isJumping = false;
        // A crashed bike's rider is not posed on it: his fall is his own (tests/unit/rider-fall.test.js)
        v.crashed = true;
        v.updateMesh();
        expect(v.riderFall.on).toBe(true);
        v.crashed = false;
        v.leanAngle = 0;
        v.updateMesh();
        expect(v.riderFall.on).toBe(false);
        expect(v.rider.rotation.z).toBe(0);
        expect(v.rider.position.x).toBe(v.riderBasePos.x);
    });

    test('the physics does not read it: the same rider with no body lean rides the same to the last bit', () => {
        const a = bike(who('steve')), b = bike({ ...who('steve'), bodyLean: 0 });
        const inputs = i => (i < 60 ? 1 : i < 150 ? -1 : i < 200 ? 0 : 0.5);
        for (let i = 0; i < 400; i++) {
            a.update(DT, inputs(i), 0.6, 0, 0);
            b.update(DT, inputs(i), 0.6, 0, 0);
        }
        for (const key of Vehicle.PHYSICS_STATE) expect(a[key]).toBe(b[key]);
        expect(a.position.toArray()).toEqual(b.position.toArray());
        expect(a.rider.rotation.z).not.toBe(0);
        expect(Math.abs(b.rider.rotation.z)).toBe(0);
    });
});
