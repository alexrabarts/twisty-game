// The tour gets slipperier toward its end: each leg's road grip (Terrain.LEGS
// grip) multiplies the weather's, through the real WeatherSystem.
import { describe, test, expect } from '@jest/globals';
import { loadGame, loadScript, legs } from '../helpers/load-game.js';

const WeatherSystem = new Function(`${loadScript('weather.js')}\nreturn WeatherSystem;`)();
const game = loadGame();

// What the bike reads on a leg, as main.js sets it up
function physicsOn(index) {
    const leg = legs(game)[index];
    const weather = new WeatherSystem({ fog: null }, null);
    const intensity = leg.weatherIntensity;
    weather.setMix({ rain: leg.weather === 'rain' ? 1 : 0, snow: leg.weather === 'snow' ? 1 : 0, fog: leg.weather === 'fog' ? 1 : 0, intensity });
    weather.surfaceGrip = game.Terrain.legConfig(index).grip ?? 1;
    return weather.getPhysicsMultipliers();
}

describe('grip by leg', () => {
    const all = Array.from({ length: 8 }, (_, i) => physicsOn(i));
    const road = Array.from({ length: 8 }, (_, i) => game.Terrain.legConfig(i).grip ?? 1);

    test('the first five legs keep full grip (high-pass is bound to the frozen golden)', () => {
        all.slice(0, 5).forEach(p => {
            expect(p.lateralFriction).toBe(1);
            expect(p.brakeForce).toBe(1);
        });
    });

    test('the road grip steps down over the last three legs', () => {
        expect(road).toEqual([1, 1, 1, 1, 1, 0.95, 0.9, 0.85]);
    });

    test('with the weather, the rain of storm-valley and the snow of winter-pass grip least, winter-pass least of all', () => {
        const lateral = all.map(p => p.lateralFriction);
        expect(lateral[5]).toBeCloseTo(0.73 * 0.95, 9);
        expect(lateral[6]).toBeCloseTo(0.9, 9);
        expect(lateral[7]).toBeCloseTo(0.4 * 0.85, 9);
        expect(Math.min(...lateral)).toBe(lateral[7]);
        expect([...lateral].sort((a, b) => a - b).slice(0, 2)).toEqual([lateral[7], lateral[5]]);
        // Braking loses grip with the road; the engine pulls as the weather lets it
        expect(all[7].brakeForce).toBeCloseTo(0.6 * 0.85, 9);
        expect(all[7].acceleration).toBeCloseTo(0.7, 9);
    });
});
