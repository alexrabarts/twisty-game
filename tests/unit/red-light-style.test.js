/**
 * @jest-environment node
 */
// Jumping a red light at a roadworks site earns style (Game.updateRoadworks, Roadworks.RED_RUN_STYLE). It cost style
// before. The oncoming traffic in the single lane is the risk the bonus is paid for. Once for each site in a ride.
import { describe, test, expect } from '@jest/globals';
import { loadGame, gameMethods } from '../helpers/load-game.js';

const { Roadworks } = loadGame(undefined, []);

function rig(events) {
    const calls = [];
    const self = {
        score: 100,
        environment: { roadworks: { takeEvents: () => events.splice(0) } },
        addScore(points) { this.score += points; }
    };
    const HudRules = { number: (n, { sign } = {}) => `${sign && n > 0 ? '+' : ''}${n}` };
    Object.assign(self, gameMethods(['updateRoadworks'], self, { Roadworks, HudRules, showCallout: (...args) => calls.push(args) }));
    return { self, calls };
}

describe('a red light jumped earns style', () => {
    test('the style rises by the bonus, with a good call-out that says how much', () => {
        const { self, calls } = rig([{ kind: 'red', site: 3 }]);
        self.updateRoadworks();
        expect(Roadworks.RED_RUN_STYLE).toBeGreaterThan(0);
        expect(self.score).toBe(100 + Roadworks.RED_RUN_STYLE);
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBe(`Jumped a red light +${Roadworks.RED_RUN_STYLE} style`);
        expect(calls[0][1]).toBe('good');
    });

    test('once for each site in a ride: going back for the same light earns nothing, another site does', () => {
        const events = [{ kind: 'red', site: 3 }];
        const { self, calls } = rig(events);
        self.updateRoadworks();
        events.push({ kind: 'red', site: 3 });
        self.updateRoadworks();
        expect(self.score).toBe(100 + Roadworks.RED_RUN_STYLE);
        expect(calls).toHaveLength(1);
        events.push({ kind: 'red', site: 4 });
        self.updateRoadworks();
        expect(self.score).toBe(100 + 2 * Roadworks.RED_RUN_STYLE);
    });

    test('no light jumped, no change; and a world with no roadworks is left alone', () => {
        const { self, calls } = rig([{ kind: 'knock', site: 3 }]);
        self.updateRoadworks();
        expect(self.score).toBe(100);
        expect(calls).toHaveLength(0);
        self.environment.roadworks = null;
        expect(() => self.updateRoadworks()).not.toThrow();
    });
});
