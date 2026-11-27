// The server's limits (functions/lib/boards.js) agree with what the game can do. functions/ is deployed alone and
// cannot load the game's scripts, so its numbers are bound to the game's source here.
import { describe, test, expect } from '@jest/globals';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const boards = require('../../functions/lib/boards.js');

describe('the limits come from what the game can do', () => {
    test('the floor speed is above the fastest bike on the fastest character', () => {
        const source = readFileSync(new URL('../../js/vehicle.js', import.meta.url), 'utf8');
        const multipliers = [...source.matchAll(/maxSpeed:\s*([0-9.]+),/g)].map(match => Number(match[1]));
        const baseSpeed = Number(/this\.maxSpeed = (\d+);/.exec(source)[1]);
        const fastest = Math.max(...multipliers) * baseSpeed;
        expect(fastest).toBeCloseTo(74.8, 6);
        expect(boards.FLOOR_SPEED).toBeGreaterThanOrEqual(1.1 * fastest - 1e-9);
    });

    test('an honest ride over the smallest allowed gate gap is never under the gate floor', () => {
        expect(boards.LONG.minGateMs).toBeLessThanOrEqual(500 / boards.FLOOR_SPEED * 1000);
    });

    test('the restart penalty is the same number on the client and on the server', () => {
        const source = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
        expect(Number(/Game\.RESTART_PENALTY_MS = (\d+);/.exec(source)[1])).toBe(boards.LONG.penaltyMs);
    });

    test('the server session lasts longer than the slowest run it accepts', () => {
        expect(boards.LONG.ttlMs).toBeGreaterThan(boards.LONG.maxTotalMs);
        expect(boards.LEGACY.ttlMs).toBeGreaterThan(boards.LEGACY.maxTimeMs);
    });
});
