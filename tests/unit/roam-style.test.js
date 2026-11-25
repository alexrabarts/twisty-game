// The style ride of free roam (js/world/style.js; .agent/system/world.md, "Free roam"): each wheelie measured as it
// ends, a pop under MIN_M or one that ends in a crash not counted, the bests kept in the store between rides
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { RoamStyle } = new Function(`${readFileSync(`${root}js/world/style.js`, 'utf8')}\nreturn { RoamStyle };`)();
const memory = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };

// A wheelie of `seconds` at `speed` m/s along z, then the front down; the style score rises 50 a second on it
function ride(style, seconds, speed, { crash = false, score = 0 } = {}) {
    const bike = { isWheelie: true, wheelieAngle: 0.6, crashed: false, position: { x: 0, z: 0 } };
    const dt = 1 / 60;
    let done = null;
    for (let t = 0; t < seconds; t += dt) {
        bike.position.z += speed * dt;
        score += 50 * dt;
        done = style.step(bike, score, dt) || done;
    }
    bike.isWheelie = false;
    bike.crashed = crash;
    return style.step(bike, score, dt) || done;
}

describe('the style ride', () => {
    test('a wheelie is measured as it ends: metres, seconds, its highest angle; the longest is the best', () => {
        const style = new RoamStyle('w', memory());
        const one = ride(style, 3, 10);
        expect(one.m).toBeCloseTo(30, 0);
        expect(one.s).toBeCloseTo(3, 1);
        expect(one.deg).toBeCloseTo(34.4, 0);
        expect(one.best).toBe(true);
        expect(RoamStyle.callout(one)).toBe('Best wheelie! 30 m, 3.0 s');
        expect(ride(style, 1, 10).best).toBe(false);
        expect(style.text()).toMatch(/^Best wheelie 30 m · Best style \d+/);
    });

    test('a pop under the least and a wheelie that ends in a crash are not counted', () => {
        const style = new RoamStyle('w', memory());
        expect(ride(style, 0.3, 10)).toBe(null);
        expect(ride(style, 3, 10, { crash: true })).toBe(null);
        expect(style.best.wheelieM).toBe(0);
    });

    test('the bests are kept in the store between rides; a store that throws keeps them for the ride', () => {
        const store = memory();
        ride(new RoamStyle('w', store), 2, 10, { score: 500 });
        const again = new RoamStyle('w', store);
        expect(again.best.wheelieM).toBeCloseTo(20, 0);
        expect(again.best.score).toBeGreaterThanOrEqual(500);
        expect(new RoamStyle('other', store).best.wheelieM).toBe(0);
        const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
        const style = new RoamStyle('w', broken);
        expect(ride(style, 2, 10).best).toBe(true);
    });
});
