/**
 * @jest-environment node
 */
// Where the menu's rider stands (js/home.js): the camera's view is shifted so the stage box's centre is the view's
// centre, and the camera stands as far off as the box needs for the whole bike; a box too small is not drawn.
import { describe, test, expect } from '@jest/globals';
import { loadScript } from '../helpers/load-game.js';

const { HomeStage } = new Function(`${loadScript('home.js')}\nreturn { HomeStage };`)();

// Where a point at the look-at target lands on screen with the view offset (the target is the view's centre)
const centre = (frame, view) => ({ x: view.w / 2 - frame.offsetX, y: view.h / 2 - frame.offsetY });

describe('the stage', () => {
    test('the bike stands at the stage box\'s centre: left of the panel on a wide window, over it on a phone', () => {
        const wide = { w: 1440, h: 900 };
        const stage = { x: 0, y: 0, w: 940, h: 900 };
        expect(centre(HomeStage.frame(stage, wide), wide)).toEqual({ x: 470, y: 450 });
        const phone = { w: 390, h: 844 };
        const top = { x: 0, y: 0, w: 390, h: 253 };
        expect(centre(HomeStage.frame(top, phone), phone)).toEqual({ x: 195, y: 126.5 });
    });

    test('the whole bike fits: a smaller box puts the camera farther off, within its limits', () => {
        const view = { w: 1440, h: 900 };
        const big = HomeStage.frame({ x: 0, y: 0, w: 940, h: 900 }, view, 38);
        const narrow = HomeStage.frame({ x: 0, y: 0, w: 420, h: 900 }, view, 38);
        expect(narrow.distance).toBeGreaterThan(big.distance);
        const span = 2 * Math.tan((38 * Math.PI) / 360);
        for (const [frame, box] of [[big, { w: 940, h: 900 }], [narrow, { w: 420, h: 900 }]]) {
            // The bike's height and length on screen, in px, at that distance
            const px = m => (m / (span * frame.distance)) * view.h;
            expect(px(HomeStage.SIZE.height)).toBeLessThanOrEqual(box.h * HomeStage.FILL.height + 1e-6);
            expect(px(HomeStage.SIZE.length)).toBeLessThanOrEqual(box.w * HomeStage.FILL.width + 1e-6);
        }
        expect(HomeStage.frame({ x: 0, y: 0, w: 60, h: 60 }, view).distance).toBe(HomeStage.FAR_M);
        expect(HomeStage.frame({ x: 0, y: 0, w: 4000, h: 4000 }, { w: 4000, h: 4000 }, 120).distance).toBe(HomeStage.NEAR_M);
    });

    test('a box too small, or none, is not drawn', () => {
        expect(HomeStage.frame({ x: 0, y: 0, w: 0, h: 0 }, { w: 390, h: 844 }).shown).toBe(false);
        expect(HomeStage.frame(null, { w: 390, h: 844 }).shown).toBe(false);
        expect(HomeStage.frame({ x: 0, y: 0, w: 300, h: 200 }, { w: 390, h: 844 }).shown).toBe(true);
    });
});
