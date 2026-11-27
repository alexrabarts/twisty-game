// Shared by the debug scripts here: load a world stage in node as the jest world tests do, and settle the streamer.
// The game's console goes to a sink; with TWISTY_LOG=1 its lines are printed to stderr (a console.log put in a
// builder while tracing it)
import { loadGame } from '../../../tests/helpers/load-game.js';
import { diskFetch } from '../../../tests/helpers/world-fetch.js';

export async function loadStage(stage) {
    const log = [];
    if (process.env.TWISTY_LOG) log.push = (...lines) => { for (const line of lines) process.stderr.write(`${line}\n`); return 0; };
    const game = loadGame(undefined, log);
    const { fetchFn } = diskFetch();
    const env = await game.WorldEnvironment.load(new game.THREE.Scene(), { id: stage, fetchFn, models: null, digest: async () => '0' });
    env.scenery.buildTile = () => null;
    return { game, env };
}

// Put the bike down at ride s and wait until the streamer has built everything round it
export async function settleAt(env, s) {
    const at = Math.max(env.startS + 1, Math.min(env.endS - 1, s));
    const p = env.route.sample(at, {});
    env.update(p, at, null, Infinity);
    await env.streamer.settle(p, at);
    return p;
}

export const r2 = n => Math.round(n * 100) / 100;
