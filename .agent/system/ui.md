# HUD and menus

- `css/ui.css` holds every style for the HUD, call-outs, run cards (crash, finish) and menus. Colours, radii, shadows, sizes and safe-area edges are custom properties at the top of the file. Use a token; do not add a new colour in a component.
- Two fonts: Barlow Condensed for numbers and headings (tabular figures), Inter for UI text. Both load from Google Fonts with system fallbacks.
- `js/hud.js` owns the in-game HUD. `HudRules` holds the decisions (hint timing, FPS toggle, touch detection, speed gauge) as pure functions; `Hud` does the DOM writes. Per-frame writes go to existing text nodes and only when the shown value changes.
- The timer column (`.hud-top`) is one flex column: timer, start card, wheelie, split, call-outs. Items in it cannot overlap. Call a message with `showCallout(text, tone, ms)`; tones are `info`, `good`, `bad`, `warn` and `gold`. At most three show at once.
- Gate pips: one per gate, built by `Hud.setGates(passed, total)`. A converted leg has 14 to 20 gates, so above `HudRules.MANY_GATES` (8) the pips row carries `data-many` and `css/ui.css` shrinks the pips and the gap to fit a 360 px phone.
- In-game panels do not use `backdrop-filter`: blurring the live canvas costs GPU time every frame.
- Touch controls exist only when `(pointer: coarse)` matches, or after the first touch on a laptop. `body.touch` moves the speed gauge to the top right.
- The FPS counter is off by default. Show it with `?fps=1` or the backquote key; the key's choice is kept in `localStorage` (`twistyShowFps`).
- `body.run-over` hides the HUD and touch controls behind the finish card. `body.in-menu` hides them behind the menus.
- `prefers-reduced-motion` keeps every message but drops the movement.
- The rider screen's card has three rows that are chosen apart: the rider (the carousel, left and right), the bike (`.bike-picker`, up and down, the least powerful first, no wrap) and the outfit (`.outfit-picker`, Q and E or its arrows, no wrap; a rider with one outfit has no row). A rider's bikes open one by one: the first is open, and a ride finished on the best open bike opens the next (`TourSystem.openBikes`, `markRideFinished`, saved as `twistyBikeUnlocks`; the finish screen shows it as an unlock card). Debug mode opens every bike and saves nothing. A new rider or bike needs no code here: the rows read `CHARACTERS[*].bikes` and `.outfits`. Swapping bikes between riders is not built.
