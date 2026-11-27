/**
 * @jest-environment node
 */
// A few of a tube's lamps have failed (TubeShade.lampState, .agent/system/world.md "The inside of a tube"): about 2 to
// 3% dark, never two in a row, about 1% flickering, none flickering within FAIL.calmM of a portal, and a flicker
// that is a gentle failing tube: mostly on, its light never stepping more than 3 times a second
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';

const game = loadGame(undefined, []);
const { TubeShade } = game;
const F = TubeShade.FAIL;
const N = 20000;

describe('failing tube lamps', () => {
    test('2 to 3% dark, never two in a row; about 1% flickering', () => {
        let dead = 0, flicker = 0, pair = 0;
        let last = false;
        for (let id = 0; id < N; id++) {
            const off = TubeShade.lampState(id, 200, 0) === 0;
            if (off) dead++;
            // (two in a row: the next lamp on the crown, every second id, or the next one at all near a portal)
            if (off && (last || TubeShade.lampState(id - 2, 200, 0) === 0)) pair++;
            last = off;
            let varies = false;
            for (let t = 0; t < 60 && !varies; t += 0.25) varies = TubeShade.lampState(id, 200, t) !== TubeShade.lampState(id, 200, 0);
            if (varies) flicker++;
        }
        expect(dead / N).toBeGreaterThan(0.015);
        expect(dead / N).toBeLessThan(0.035);
        expect(pair).toBe(0);
        expect(flicker / N).toBeGreaterThan(0.004);
        expect(flicker / N).toBeLessThan(0.015);
    });

    test('no flicker near a portal; a flicker is mostly on and steps at most 3 times a second', () => {
        const flickering = [];
        for (let id = 0; id < N && flickering.length < 40; id++) {
            if (TubeShade.lampState(id, 200, 0) === 0) continue;
            let varies = false;
            for (let t = 0; t < 60 && !varies; t += 0.25) varies = TubeShade.lampState(id, 200, t) !== TubeShade.lampState(id, 200, 0);
            if (varies) flickering.push(id);
        }
        expect(flickering.length).toBeGreaterThan(5);
        for (const id of flickering) {
            for (let t = 0; t < 60; t += 0.5) expect(TubeShade.lampState(id, F.calmM - 1, t)).toBe(1);
            let on = 0, worst = 0, prev = TubeShade.lampState(id, 200, 0), window = [];
            const dt = 1 / 60;
            for (let k = 1; k < 120 * 60; k++) {
                const v = TubeShade.lampState(id, 200, k * dt);
                expect(v).toBeGreaterThanOrEqual(F.low - 1e-9);
                if (v > 0.95) on++;
                // (a dimming: the light falls through 0.8 of its own)
                if (prev >= 0.8 && v < 0.8) window.push(k * dt);
                window = window.filter(t => t > k * dt - 1);
                worst = Math.max(worst, window.length);
                prev = v;
            }
            expect(on / (120 * 60)).toBeGreaterThan(0.6);
            expect(worst).toBeLessThanOrEqual(3);
        }
    });
});
