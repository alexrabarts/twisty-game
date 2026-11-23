# .agent

Notes for people and AI agents who work on this repo.

- `system/` - how the game is built.
  - [graphics.md](system/graphics.md) - the quality ladder: the graphics levels, how the frame time steps them, the start level by device, what each part of a world frame costs on a phone-class page.
  - [rendering.md](system/rendering.md) - colour management, sky, lighting, post-processing, the modelled bikes and the modelled traffic cars.
  - [world.md](system/world.md) - the terrain model and the rules for scenery placement.
  - [world-data.md](system/world-data.md) - the swisstopo data gate: tools, real inspect values, gate outcomes, the world binary format.
  - [ui.md](system/ui.md) - the HUD, the design tokens and the touch controls.
  - [handling.md](system/handling.md) - the tuning table (multipliers over the handling's numbers, the debug panel's and a rider mode's), the rider modes (the table, how they stack, how to add one), how a bike's weight and spare power shape its wheelie, how to set the two facts for a new bike, how the bike stands on a world's drawn ground (pitch from both tyres, lean from the ground's normal, the foot down), how the rider falls in a crash (the cause classes, the kinds, the table of keyed poses), the rider's weight in the handling (bike plus rider), a bike's own lean limit (the scooter), and a rider who cannot reach the ground on a slope.
  - [leaderboard.md](system/leaderboard.md) - checkpoint restart, which time a board ranks, the server handshake and store.
- `sop/` - procedures.
  - [play-testing.md](sop/play-testing.md) - how to ride a leg with the dev autopilot.
  - [photo-match.md](sop/photo-match.md) - how to match the game against the owner's photos, round by round, and size an import to cover them.

Add a file when you learn something that the code does not show. Keep each file short.
