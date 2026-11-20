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
- The card's five bars (speed, accel, handling, jump, comfort; 1 to 5) are worked out, not written: `TourSystem.statsOf(character, bikeId)` (`Vehicle.statsOf`, js/vehicle.js). The card shows them for the bike in the bike row and draws them again at each step. A character has no `stats`.
  - The bike's part of a bar reads one number of `Vehicle.physicsOf` for that rider on that bike, over a range (`STAT_BARS`): 1 star at `from`, 5 stars at `to`. The class of the bike and a light bike are in those physics already. The jump bar adds 1.75 stars for a whole off-road bike (`offroad` 1).

    | Bar | Physics | 1 star | 5 stars | Bike's own fact | Rider's traits |
    | --- | --- | --- | --- | --- | --- |
    | speed | `maxSpeed` | 0.7 | 1.2 | | mean of `country` and `mountain` |
    | accel | `acceleration` | 0.65 | 1.25 | | |
    | handling | `steeringForce` | 0.9 | 1.15 | | `hairpins` |
    | jump | `jumpPower` | 0.5 | 1.6 | + 1.75 x `offroad` | `daring` |
    | comfort | `comfortShake` | 1.4 | 0.3 | | |

  - The rider's part is the trait itself (1 to 5). A bar with traits is four parts bike and one part rider (`RIDER_SHARE` 0.2), then rounded and held to 1 to 5. A character without traits counts as 3.
  - The ranges are chosen so that each rider on the first bike reads as the hand-written card did, within one star. Six bars differ by one: Steve's speed (5 to 4) and comfort (1 to 2), Alex's jump (4 to 3), Lucy's jump (3 to 4), Guy's speed (3 to 2) and handling (4 to 3). `tests/unit/characters.test.js` holds the old stars, these six, and the rules: more top speed never shows less speed and a tenth more shows more; an adventure or trail bike shows more jump and comfort than the same rider's road bikes; a superbike shows the least comfort.
  - A new character or bike needs no code here. Change a range only with the test's table in view: a first bike must stay within one star.
- A status text over the 3D stage (the world's loading screen, `#world-loading`) stands in a panel (`.world-loading-box`, the rider card's look) on a dimmed screen, low where the rider card stood, never as bare text over the picture: the stage behind it can be any colour.
- The mini map of a world ride shows the group: a dot for each rider on the road in that rider's `mapColor` (`CHARACTERS`; told apart from the others, from the player's red arrow and from the yellow ride, which `tests/unit/world-map-markers.test.js` holds), under the player's arrow; a rider off the map is a smaller dot held at the map's edge toward where it is (`WorldGuide.markers`, fed by `Game.groupOnMap`). No names: the map is 150 px. A new rider needs only the colour.
