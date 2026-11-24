/**
 * @jest-environment node
 */
// Steve's mini moto (BIKE_MODELS bike17_minimoto): its rider sits back on the seat's extension, so under the throttle
// the front goes light and it steers less (`rearLoad`, Vehicle.steerUnderThrottle). Every other bike steers the same
// at any throttle. The real Vehicle on a flat plane, as tests/unit/bike-counter-steer.test.js.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';

const DT = 1 / 60;
const game = loadGame();
const { Vehicle } = game;
const steve = game.CHARACTERS.find(c => c.id === 'steve');

function bike(id, world) {
    const v = new Vehicle(new game.THREE.Scene(), null, steve, id, { model: false });
    if (world) {
        v.environment = {
            physics: game.WorldPhysics,
            route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade: 0, flags: {} }) }
        };
    }
    return v;
}

// The lean the bike reaches from upright after `seconds` of full steering at `speed`, the speed held. A second upright
// first, so the world's throttle has opened to the input (it rises over throttleRiseS)
function lean(id, throttle, { world = true, speed = 12, seconds = 0.25 } = {}) {
    const v = bike(id, world);
    for (let i = 0; i < 60; i++) {
        v.speed = speed;
        v.update(DT, 0, throttle, 0, 0);
    }
    expect(Math.abs(v.leanAngle)).toBeLessThan(1e-6);
    for (let i = 0; i < seconds * 60; i++) {
        v.speed = speed;
        v.update(DT, 1, throttle, 0, 0);
    }
    return Math.abs(v.leanAngle);
}

describe('the mini moto steers less under the throttle', () => {
    test('it is Steve\'s, black, a mini bike, and the only bike with its rider far back', () => {
        expect(steve.bikes).toContain('bike17_minimoto');
        expect(steve.bikes[0]).toBe('bike08_xsr900');
        expect(game.BIKE_MODELS.bike17_minimoto).toMatchObject({ cls: 'mini', paint: 0x020202 });
        const loaded = Object.keys(game.BIKE_MODELS).filter(id => Vehicle.rearLoadOf(id) > 0);
        expect(loaded).toEqual(['bike17_minimoto']);
    });

    test('the share of steering kept falls with the throttle, to 1 - rearLoad at full', () => {
        const load = Vehicle.rearLoadOf('bike17_minimoto');
        expect(Vehicle.steerUnderThrottle(load, 0)).toBe(1);
        expect(Vehicle.steerUnderThrottle(load, 1)).toBeCloseTo(1 - load, 9);
        expect(Vehicle.steerUnderThrottle(load, 0.5)).toBeCloseTo(1 - load / 2, 9);
        expect(Vehicle.steerUnderThrottle(0, 1)).toBe(1);
    });

    test.each([['a world', true], ['a leg', false]])('on %s, it leans in slower at full throttle than at a cruise', (_, world) => {
        const cruise = lean('bike17_minimoto', 0.2, { world });
        const full = lean('bike17_minimoto', 1, { world });
        expect(cruise).toBeGreaterThan(0.02);
        expect(full).toBeLessThan(cruise * 0.85);
    });

    test('a bike with its rider over the middle leans in the same at any throttle', () => {
        const cruise = lean('bike08_xsr900', 0.2);
        const full = lean('bike08_xsr900', 1);
        expect(full).toBeCloseTo(cruise, 6);
    });
});
