// The player's camera views (js/main.js, Game.setupCamera): only the near and the far chase, the far one for a fresh
// player, Z toggles the two, and the choice is kept by its type. An index saved when there were four views (0 Onboard,
// 1 Helmet Cam, 2 Standard, 3 High View) reads as the near chase for Standard and the far chase for every other.
import { describe, test, expect, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadGame } from '../helpers/load-game.js';

const { THREE, WorldCamera } = loadGame();
const source = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
const classSource = source.slice(0, source.indexOf('Game.RESTART_CLEAR_SEGMENTS = 6;') + 'Game.RESTART_CLEAR_SEGMENTS = 6;'.length);
const callouts = [];
const Game = new Function('THREE', 'WorldCamera', 'showCallout', 'TourSystem', 'Course', `${classSource}\nreturn Game;`)(
    THREE, WorldCamera, (text) => callouts.push(text), {}, {}
);

// A game with only its camera set up, from what is saved now
const setUp = () => {
    const game = Object.create(Game.prototype);
    game.setupCamera();
    return game;
};
const view = game => game.cameraModes[game.cameraMode].type;

describe('the camera views', () => {
    beforeEach(() => {
        localStorage.clear();
        callouts.length = 0;
    });

    test('there are two, the far and the near chase, and both are chase cameras behind the bike', () => {
        const game = setUp();
        expect(game.cameraModes.map(m => [m.type, m.name])).toEqual([['far', 'Far chase'], ['near', 'Near chase']]);
        for (const mode of game.cameraModes) expect(mode.offset.z).toBeLessThan(0);
        // The far one is higher and farther back
        const [far, near] = game.cameraModes;
        expect(far.offset.y).toBeGreaterThan(near.offset.y);
        expect(far.offset.z).toBeLessThan(near.offset.z);
    });

    test('a fresh player starts in the far chase', () => {
        expect(view(setUp())).toBe('far');
    });

    test('the camera key toggles the two, and the choice is kept by its type', () => {
        const game = setUp();
        expect(game.toggleCameraView().type).toBe('near');
        expect(localStorage.getItem(Game.CAMERA_KEY)).toBe('near');
        expect(callouts).toEqual(['Camera: Near chase']);
        expect(view(setUp())).toBe('near');
        expect(game.toggleCameraView().type).toBe('far');
        expect(localStorage.getItem(Game.CAMERA_KEY)).toBe('far');
        expect(view(setUp())).toBe('far');
    });

    test('an index saved before reads as near for Standard and far for the others', () => {
        const read = { 0: 'far', 1: 'far', 2: 'near', 3: 'far' };
        for (const [saved, want] of Object.entries(read)) {
            localStorage.setItem(Game.CAMERA_KEY, saved);
            expect(view(setUp())).toBe(want);
        }
        // and anything else is far
        for (const saved of ['', 'helmet', 'onboard', '7', 'NaN']) expect(Game.cameraViewOf(saved)).toBe('far');
        expect(Game.cameraViewOf(null)).toBe('far');
    });

    test('a probe sets a view by its type', () => {
        const game = setUp();
        game.setCameraView('near');
        expect(view(game)).toBe('near');
        game.setCameraView('far');
        expect(view(game)).toBe('far');
        // (nothing is saved by it)
        expect(localStorage.getItem(Game.CAMERA_KEY)).toBeNull();
    });

    test('nothing of the helmet or the onboard view is left in the game', () => {
        expect(source).not.toMatch(/'helmet'|'onboard'|updateHelmetCamera|hideAround/);
        expect(readFileSync(new URL('../../js/vehicle.js', import.meta.url), 'utf8')).not.toMatch(/hideAround|HIDDEN_LAYER/);
    });
});
