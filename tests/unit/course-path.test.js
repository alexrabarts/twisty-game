// Every leg cuts its road from the one shared course. These pins hold the path
// and the gate list of each leg, so a change to the course code (a long-leg
// engine, a per-leg course) cannot move a leg that has not been converted.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { createHash } from 'node:crypto';
import { loadGame, buildEnvironment } from '../helpers/load-game.js';

const PINS = [
    ['mountain-dawn', 'dc56c329cc37e65c', [10, 23, 36, 49, 62]],
    ['valley-run', 'b801059ba3676184', [81, 96, 111, 126, 141]],
    ['coastal-descent', 'a82045dab2d1e447', [162, 177, 192, 207, 222]],
    ['foggy-gorge', '86c3226df4c4dc2c', [247, 263, 279, 295, 311]],
    ['high-pass', 'b801059ba3676184', [335, 352, 369, 386, 403]],
    ['storm-valley', '8f45e8e0b9e13e9a', [428, 446, 464, 482, 500]],
    ['night-ride', '7ab617d29f3868a1', [524, 542, 560, 578, 596]],
    ['winter-pass', '40971374c5f335a1', [622, 640, 658, 676, 694]]
];

describe('the shared course, per leg', () => {
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    test.each(PINS.map((pin, index) => [...pin, index]))('%s keeps its path digest and gates', (id, digest, gates, index) => {
        const quiet = console.log;
        console.log = () => {};
        let built;
        try {
            built = buildEnvironment(game, index);
        } finally {
            console.log = quiet;
        }
        const { env, leg } = built;
        expect(leg.id).toBe(id);
        expect(env.roadPath).toHaveLength(744);
        const flat = new Float64Array(env.roadPath.flatMap(point => [point.x, point.z, point.y, point.heading]));
        expect(createHash('sha256').update(Buffer.from(flat.buffer)).digest('hex').slice(0, 16)).toBe(digest);
        expect(env.checkpoints.map(checkpoint => checkpoint.segmentIndex)).toEqual(gates);
    });
});
