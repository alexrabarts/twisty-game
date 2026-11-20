/**
 * @jest-environment node
 */
// The rider's one headlight (Traffic.BEAM, Traffic.inBeam, Traffic.stepDip; Game aims and dims the light by them):
// main beam with a clear road, dipped while a car or a rider is in front, going either way. And one light: the bike's
// lamp draws no second thing (a glowing cone in the air stood in front of it before).
import { describe, test, expect } from '@jest/globals';
import { loadGame, loadScript } from '../helpers/load-game.js';

const { Traffic } = loadGame();
const BEAM = Traffic.BEAM;
const DT = 1 / 60;
// Traffic with a car and a rider at the places given, {ahead, side} metres from a bike at the origin heading `yaw`
function inBeam(places, yaw = 0.7) {
    const at = ({ ahead, side }) => ({ position: { x: ahead * Math.sin(yaw) + side * Math.cos(yaw), z: ahead * Math.cos(yaw) - side * Math.sin(yaw) } });
    const stub = { cars: places.filter((_, i) => i % 2 === 0).map(p => ({ carGroup: at(p) })), motorcycles: places.filter((_, i) => i % 2 === 1).map(p => ({ bikeGroup: at(p) })) };
    return Traffic.prototype.inBeam.call(stub, 0, 0, yaw);
}

describe('the headlight dips for a vehicle in front', () => {
    test('a car or a rider ahead in the beam counts, whichever way it goes; one behind or off to the side does not', () => {
        expect(inBeam([])).toBe(false);
        // The place is all that is read, so a vehicle that comes toward the bike and one that goes its way are the same
        for (const ahead of [5, 30, 80, BEAM.rangeM - 1]) {
            expect(inBeam([{ ahead, side: 0 }])).toBe(true);
            expect(inBeam([{ ahead: -200, side: 0 }, { ahead, side: 2 }])).toBe(true);
            expect(inBeam([{ ahead, side: -(BEAM.sideM + BEAM.spread * ahead - 0.1) }])).toBe(true);
            expect(inBeam([{ ahead, side: BEAM.sideM + BEAM.spread * ahead + 0.5 }])).toBe(false);
        }
        expect(inBeam([{ ahead: -10, side: 0 }, { ahead: -1, side: 1 }])).toBe(false);
        expect(inBeam([{ ahead: BEAM.rangeM + 5, side: 0 }])).toBe(false);
        expect(inBeam([{ ahead: 0, side: 30 }, { ahead: 20, side: 25 }])).toBe(false);
    });

    test('the beam dips quickly, holds for a moment after the road clears, then rises, with no step', () => {
        const state = {};
        const dips = [];
        const run = (seconds, ahead) => { for (let i = 0; i < seconds * 60; i++) dips.push(Traffic.stepDip(state, ahead, DT)); };
        run(1, false);
        expect(dips[dips.length - 1]).toBe(0);
        run(BEAM.dipS + 0.1, true);
        expect(dips[dips.length - 1]).toBe(1);
        // A car that passes behind a bend for less than the hold does not let the beam up
        run(BEAM.holdS - 0.2, false);
        expect(dips[dips.length - 1]).toBe(1);
        run(0.5, true);
        run(BEAM.holdS - 0.05, false);
        expect(dips[dips.length - 1]).toBe(1);
        run(BEAM.riseS + 0.2, false);
        expect(dips[dips.length - 1]).toBe(0);
        for (let i = 1; i < dips.length; i++) expect(Math.abs(dips[i] - dips[i - 1])).toBeLessThan(1.6 * DT / Math.min(BEAM.dipS, BEAM.riseS));
    });

    test('dipped is a nearer aim, a shorter reach and less light than the main beam', () => {
        for (const key of ['aimM', 'reachM', 'gain']) expect(BEAM.dipped[key]).toBeLessThan(BEAM.main[key]);
    });

    test('the game makes one light for the lamp and nothing else, and writes the beam from the dip', () => {
        const source = loadScript('main.js');
        expect(source.match(/new THREE\.SpotLight\(/g)).toHaveLength(1);
        expect(source).not.toMatch(/new THREE\.PointLight\(/);
        expect(source).not.toMatch(/headlightBeam/);
        expect(source).toMatch(/this\.traffic\.inBeam\(/);
        expect(source).toMatch(/Traffic\.stepDip\(/);
    });
});
