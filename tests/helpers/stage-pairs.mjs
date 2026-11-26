// Every rider on every bike of theirs in the catalogue rides the shipped stage on one scripted line, in Road mode (no
// rider mode loaded), and the result is printed as JSON: [{ character, bike, crashed, cut, ticks, stations }].
// tests/unit/rider-mass.test.js runs it in a plain node process, where a ride of the whole stage takes a tenth of
// the time it takes under jest's module sandbox.
//
// The line is the same for every pair: every bend at the speed of the advice's lean (WorldPhysics.adviceLeanDeg, the
// same for every rider, and under every bike's own lean limit), braked for with 0.8 of the bike's own upright brake,
// the bike's own top speed between. What differs is the pair's: the pull, the brake, the top speed and the lean rate.
import { loadGame } from './load-game.js';
import { diskFetch } from './world-fetch.js';
import { rideSpan } from './world-rider.js';

const G = 9.81;

export function line(game, env) {
    return (s, v) => {
        const world = v.worldPhysics, m = v.worldMultipliers();
        const brake = 0.8 * v.tuned('brakeForce') * world.brakeGain * m.brakeForce;
        let allowed = v.tuned('maxSpeed');
        for (let d = 0; d <= 300; d += 4) {
            const k = Math.min(Math.abs(env.route.curvatureAt(s + d, 6)), 1 / world.radiusFloor);
            if (k < 1e-4) continue;
            const corner = Math.sqrt(G * Math.tan(game.WorldPhysics.adviceLeanDeg * Math.PI / 180) * m.lateralFriction / k);
            allowed = Math.min(allowed, Math.sqrt(corner * corner + 2 * brake * d));
        }
        return allowed;
    };
}

export async function stagePairs() {
    const game = loadGame();
    const env = await game.WorldEnvironment.load(new game.THREE.Scene(), { id: 'tremola', fetchFn: diskFetch().fetchFn, models: null, digest: async () => '0' });
    const rows = [];
    for (const character of game.CHARACTERS) {
        for (const bike of character.bikes.filter(id => game.BIKE_MODELS[id])) {
            const out = await rideSpan(game, env, { s0: env.startS, s1: env.route.length, speed: line(game, env), character, bike, most: 60 * 900 });
            rows.push({ character: character.id, bike, crashed: out.crashed, cut: out.cut, ticks: out.ticks, stations: out.stations || [] });
        }
    }
    return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    stagePairs().then(rows => process.stdout.write(JSON.stringify(rows)), (error) => {
        process.stderr.write(`${error.stack || error}\n`);
        process.exit(1);
    });
}
