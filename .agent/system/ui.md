# HUD and menus

- `css/ui.css` holds every style for the HUD, call-outs, run cards (crash, finish) and menus. Colours, radii, shadows, sizes and safe-area edges are custom properties at the top of the file. Use a token; do not add a new colour in a component.
- Two fonts: Barlow Condensed for numbers and headings (tabular figures), Inter for UI text. Both load from Google Fonts with system fallbacks.
- `js/hud.js` owns the in-game HUD. `HudRules` holds the decisions (hint timing, FPS toggle, touch detection, speed gauge) as pure functions; `Hud` does the DOM writes. Per-frame writes go to existing text nodes and only when the shown value changes.
- The HUD's layout: each thing has one place, and the places are these. `tools/terrain-check.mjs world-hud` fails when two of them intersect or one leaves the screen, at 1024x640, 1440x900 and 390x844 (touch), with everything shown at once.

  | Place | Wide screen | Phone held upright (touch, under 700 px) | Holds |
  | --- | --- | --- | --- |
  | Top centre column (`.hud-top`) | top centre | top centre, between the two corners | the timer panel, then the split, the wheelie meter, the start card, the call-outs |
  | The map's corner (`#world-guide`, `#hudGuide`) | top right (top left on touch) | top left; the prompt and the advice are the first row of the column | the mini map, the turn prompt, the advised speed (a world ride only) |
  | The bike's corner (`#hudBike`) | bottom right | top right | the speed gauge and the three slots |
  | Key hints (`#hudHint`) | bottom left | over the steering buttons | the keys, or the thumbs on touch |
  | FPS (`#fps`) | top left | over the steering buttons | the counter, when asked for |

  - The corners share their edges: `--edge-top`, `--edge-right`, `--edge-bottom`, `--edge-left`. The map and the bike's corner have the same right edge; the timer and the map the same top; the hints and the gauge the same bottom.
  - The middle of the screen is the road's. Only the call-outs and the wheelie meter (short pills) reach it; the split is two rows and stays over it.
  - Widths are tokens, not numbers in a rule: `--map-size` (150 px, 96 px on touch and under 700 px), `--side-w` (what a corner may take: the map with its prompt), `--col-w` (what that leaves the column), `--top-row` (the height the top corners and the timer share on a phone), `--bike-side` (the slots). In a world ride each item of the column keeps to `--col-w`, so it cannot reach a corner.
  - A phone held upright has no room beside the column. The timer stands between the map and the gauge and is as tall as they are (`--top-row`); everything else follows under that row in the one column. The classic legs on touch follow the same rule.
  - One size scale: `--fs-timer` the clock; `--fs-split` the split's time; `--fs-callout` the call-outs, the wheelie meter and the split's gaps to the best and the record; `--fs-meta` the labels in the timer panel, and `--fs-meta` + 2 px in the display font for its numbers (`.hud-count`, the style score, the combo); `--fs-sm` the prompt and the advice; `--fs-xs` small labels.
- The timer panel (`.hud-timer`), top to bottom: the clock; the progress bar (a world ride); one meta row (the distance of a world ride, the pips of a classic leg, the style score, the combo); the stage text (a world of more than one stage).
- The checkpoints are shown once.
  - A world ride: the progress element (`#hudProgress`, `Hud.showProgress(marks)`, `setProgress(share, km, stageLine)`). The bar is the stage being ridden. It has a tick for each checkpoint of the stage (`HudRules.progressMarks`: the stations of kind `gate`; the start, the end and a stage boundary get none), green once passed; a marker at the rider's place; and the count at its end (`#hudProgressCount`). The ticks and the count come from the ride's data (`WorldRun.stageGates`), never from a constant. One custom property (`--at`) moves the fill and the marker.
  - A classic leg: the pips (`#hudGates`), one per gate. A converted leg has 14 to 20 gates, so above `HudRules.MANY_GATES` (8) the pips row carries `data-many` and `css/ui.css` shrinks the pips and the gap to fit a 360 px phone; above `MAX_PIPS` (20) the row shows the count alone.
  - `Hud.setGates(passed, total)` writes the one that is shown. `showProgress` hides the pips and `hideProgress` brings them back.
- The stage text (`#hudStageText`, `HudRules.stageLine`) and the stage number on the start card (`HudRules.stageLabel`) show only when the ride holds more than one stage (`Game.worldStageCount`). With one stage the stage clock is the main clock and "Stage 1/1" says nothing. The distance (`km 3.2 / 13.2`) is the whole ride's; a phone held upright leaves it out.
- The turn prompt and the advised speed are the HUD's own elements (`#hudPrompt`, `#hudAdvice`); `js/world/guide.js` writes them and builds only the map. Each stands in a panel, never as bare text over the picture.
- The slots beside the speed gauge are empty containers with a place and a size, for later work. Each draws nothing while it is empty. Fill a slot; do not add a new element beside the gauge.

  | Slot | For | Wide screen | Touch |
  | --- | --- | --- | --- |
  | `#hudMode` (`.hud-mode`) | the rider mode's tag (filled: `Hud.setMode`) | left of the gauge, top row, 18 px high | under the gauge, right of the gear, 16 px high |
  | `#hudGear` (`.hud-gear`) | a gear number | left of the gauge, middle row, in the display font at 0.3 of `--speed-size` | under the gauge, left, 16 px |
  | `#hudRevs` (`.hud-revs`) | a rev bar | left of the gauge, bottom row, `--bike-side` (72 px) wide, 6 px high | directly under the gauge, its width, 4 px high |

- The tuning panel (`js/tuningpanel.js`, `.tuning-panel`) exists only in debug mode (`Game.startTuning`). The table it draws and the rules are in `.agent/system/handling.md`, "The tuning".
  - T opens and closes it (`TuningPanel.KEY`). A small button (`#tuningOpen`, "T · Tune") does the same and is the way in on touch; the panel's × closes it there. The ride goes on: the panel is not a dialog of `js/modals.js` and pauses nothing.
  - It never holds the keyboard. Its sliders are drawn tracks moved with the pointer, not `<input type="range">`, and a `mousedown` in the panel is cancelled, so no control takes the focus and the ride keys go on working during and after a drag. T is the only key it reads, and not while a dialog is open or a name is typed. The read-only text box alone can take the focus; closing the panel gives it back.
  - Each row: the label (its `title` holds the hint and the fields), a step down, the track with a mark at 1.00, a step up, the number. A double click on the number puts the row back to 1.00. A changed row is in the warn colour. On a classic leg the rows that only a world ride reads are dimmed.
  - Reset puts every row at 1.00. Copy values puts the text on the clipboard; the text box under the buttons always holds the same text, for a browser that refuses the clipboard.
  - Its place: the left edge, from the top edge to the bottom edge, 268 px wide, over the FPS counter and the key hints while it is open. On touch it ends over the steering buttons, so the thumbs keep them; on a phone held upright it also covers the map and most of the timer while it is open. `body.in-menu`, `body.run-over` and the world's loading screen hide it.
  - The "tuned" tag (`#hudTuned`, `Hud.setTuned`) stands under the FPS counter while the ride is a tuned one, and the button under the tag. On touch the two share one row, the button first, over the FPS counter and under the key hints. The tag is not the `#hudMode` slot.
- Call a message with `showCallout(text, tone, ms)`; tones are `info`, `good`, `bad`, `warn` and `gold`. At most three show at once. A long one takes a second line; it does not grow past the column.
- The key hints fade after `HudRules.HINT_MS` (6 s), or 2.5 s after the first input. The pause panel brings them back for as long as it is open (`Hud.recallHint`, called by `Game.pauseRace` and `resumeRace`).
- In-game panels do not use `backdrop-filter`: blurring the live canvas costs GPU time every frame.
- Touch controls exist only when `(pointer: coarse)` matches, or after the first touch on a laptop. `body.touch` moves the bike's corner to the top right and the mini map to the top left.
- The FPS counter is off by default. Show it with `?fps=1` or the backquote key; the key's choice is kept in `localStorage` (`twistyShowFps`).
- A crash in a world ride opens no card and waits for no key: the fall plays for about 2 s (`Game.WORLD_CRASH`), a call-out in the `bad` tone says the cause and the penalty for that time (`Game.beginWorldCrash`: `<cause>  +5 s`), and the game puts the bike back on the road by itself (`.agent/system/world.md`, "A restart is in place"). The crash card (`showCrashNotification`: Checkpoint, Restart, Menu) is the classic legs' only.
- The pause panel (`WorldCredits.showPause`): Resume (P, Escape), Restart leg (R; a world ride only, through the confirm box), Menu (M), Credits, and the rider mode's control (below). The finish cards count "restarts".
- The rider mode (`js/ridermodes.js`; the table and its rules are in `.agent/system/handling.md`, "The rider modes").
  - The control (`RiderModes.control`, `.mode-picker`): a button for each mode in one row, and one line under them. It stands on the menu's rider screen (`#riderModeRow`, over RIDE) and on the pause panel, for a world ride and a classic leg alike.
  - The key is H (`RiderModes.STEP_KEY`): the next mode, round the table. On the menu and on the pause panel the button of the next mode carries it as `data-key`, so the dialog stack steps the mode. In a ride `Game.stepRiderMode` hears it.
  - On the menu the choice is free. In a ride the mode changes only while the bike stands. While the bike moves, H shows the call-out "Stop the bike to change the rider mode" and changes nothing. The pause panel reads the speed as the pause began: with the bike moving its buttons are disabled and the line under them gives the same reason. Touch has no key: pause at a stop and use the control.
  - The tag: `Hud.setMode(name, tone)` writes the mode's name into the `#hudMode` slot, on a world ride and on a classic leg. `tone` is the row's own (`data-tone`: `info`, `warn`, `bad`, or none) and colours the tag and the chosen button.
  - A change in a ride shows the call-out "Rider mode: <name>".
  - The choice is stored (`twistyRiderMode`) and is in force from the page's start.
- `body.run-over` hides the HUD, the mini map and the touch controls behind the finish card. `body.in-menu` hides them behind the menus.
- `prefers-reduced-motion` keeps every message but drops the movement.
- The rider screen's card has three rows that are chosen apart: the rider (the carousel, left and right), the bike (`.bike-picker`, up and down, the least powerful first, no wrap) and the outfit (`.outfit-picker`, Q and E or its arrows, no wrap; a rider with one outfit has no row). A rider's bikes open one by one: the first is open, and a ride finished on the best open bike opens the next (`TourSystem.openBikes`, `markRideFinished`, saved as `twistyBikeUnlocks`; the finish screen shows it as an unlock card). Debug mode opens every bike and saves nothing. A new rider or bike needs no code here: the rows read `CHARACTERS[*].bikes` and `.outfits`. Swapping bikes between riders is not built.
- The card's five bars (speed, accel, handling, jump, comfort; 1 to 5) are worked out, not written: `TourSystem.statsOf(character, bikeId)` (`Vehicle.statsOf`, js/vehicle.js). The card shows them for the bike in the bike row and draws them again at each step. A character has no `stats`.
  - The bike's part of a bar reads one number of `Vehicle.physicsOf` for that rider on that bike, over a range (`STAT_BARS`): 1 star at `from`, 5 stars at `to`. The class of the bike and a light bike are in those physics already. The jump bar adds 1.75 stars for a whole off-road bike (`offroad` 1).

    | Bar | Physics | 1 star | 5 stars | Bike's own fact | Rider's traits |
    | --- | --- | --- | --- | --- | --- |
    | speed | `maxSpeed` | 0.7 | 1.2 | | mean of `country` and `mountain` |
    | accel | `acceleration` | 0.65 | 1.25 | | |
    | handling | `steeringForce` | 0.9 | 1.15 | | mean of `hairpins` and `daring` (the lean the rider dares: `.agent/system/handling.md`, "The lean limit by the rider") |
    | jump | `jumpPower` | 0.5 | 1.6 | + 1.75 x `offroad` | `daring` |
    | comfort | `comfortShake` | 1.4 | 0.3 | | |

  - The rider's part is the trait itself (1 to 5). A bar with traits is four parts bike and one part rider (`RIDER_SHARE` 0.2), then rounded and held to 1 to 5. A character without traits counts as 3.
  - The ranges are chosen so that each rider on the first bike reads as the hand-written card did, within one star. Six bars differ by one: Steve's speed (5 to 4) and comfort (1 to 2), Alex's jump (4 to 3), Lucy's jump (3 to 4), Guy's speed (3 to 2) and handling (4 to 3). `tests/unit/characters.test.js` holds the old stars, these six, and the rules: more top speed never shows less speed and a tenth more shows more; an adventure or trail bike shows more jump and comfort than the same rider's road bikes; a superbike shows the least comfort.
  - A new character or bike needs no code here. Change a range only with the test's table in view: a first bike must stay within one star.
- A status text over the 3D stage (the world's loading screen, `#world-loading`) stands in a panel (`.world-loading-box`, the rider card's look) on a dimmed screen, low where the rider card stood, never as bare text over the picture: the stage behind it can be any colour.
- The mini map of a world ride shows the group: a dot for each rider on the road in that rider's `mapColor` (`CHARACTERS`; told apart from the others, from the player's red arrow and from the yellow ride, which `tests/unit/world-map-markers.test.js` holds), under the player's arrow; a rider off the map is a smaller dot held at the map's edge toward where it is (`WorldGuide.markers`, fed by `Game.groupOnMap`). No names: the map is 150 px. A new rider needs only the colour.
