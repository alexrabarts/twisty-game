// HomeStage: where the menu's rider stands on screen. The menu's layout (css/ui.css, `.home-stage`) gives the rider a
// box beside the choices; the game draws the showcase with its own renderer over the whole window and frames the
// rider in that box: the camera's view is shifted (THREE.PerspectiveCamera.setViewOffset) so the bike stands at the
// box's centre, and the camera stands as far off as the box needs for the whole bike to fit. Pure numbers, so the
// framing is tested without a renderer (tests/unit/home-stage.test.js).
const HomeStage = {
    // The bike and rider as the camera sees them from any side: the tallest and the longest they get (m)
    SIZE: Object.freeze({ height: 1.7, length: 2.5 }),
    // The share of the box the bike may take
    FILL: Object.freeze({ height: 0.5, width: 0.66 }),
    // The nearest and farthest the camera stands (m)
    NEAR_M: 2.6,
    FAR_M: 16,
    // A box smaller than this (px) is not drawn: the rider is not shown (a phone's map screen)
    MIN_PX: 48,

    // The view for a box `stage` ({ x, y, w, h } in CSS px) in a window `view` ({ w, h }) with the camera's vertical
    // field of view `fov` (degrees): { offsetX, offsetY } for setViewOffset over the whole window, `distance` from
    // the bike, and `shown` false when the box is too small to draw in
    frame(stage, view, fov = 50) {
        const shown = !!stage && stage.w >= HomeStage.MIN_PX && stage.h >= HomeStage.MIN_PX && view.w > 0 && view.h > 0;
        if (!shown) return { offsetX: 0, offsetY: 0, distance: HomeStage.NEAR_M, shown: false };
        const span = 2 * Math.tan((fov * Math.PI) / 360);
        // At distance d the window's height shows span * d metres
        const byHeight = (HomeStage.SIZE.height * view.h) / (HomeStage.FILL.height * stage.h * span);
        const byWidth = (HomeStage.SIZE.length * view.h) / (HomeStage.FILL.width * stage.w * span);
        const distance = Math.max(HomeStage.NEAR_M, Math.min(HomeStage.FAR_M, Math.max(byHeight, byWidth)));
        return {
            offsetX: view.w / 2 - (stage.x + stage.w / 2),
            offsetY: view.h / 2 - (stage.y + stage.h / 2),
            distance,
            shown: true
        };
    },

    // The stage box of the page's menu, or null when the menu has none in view
    box(doc) {
        const stage = doc && doc.querySelector('.home-stage');
        if (!stage) return null;
        const rect = stage.getBoundingClientRect();
        return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { HomeStage };
