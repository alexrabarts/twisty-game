# .agent

Notes for people and AI agents who work on this repo.

- `system/` - how the game is built.
  - [rendering.md](system/rendering.md) - colour management, sky, lighting, post-processing, the modelled bikes and the modelled traffic cars.
  - [world.md](system/world.md) - the terrain model and the rules for scenery placement.
  - [world-data.md](system/world-data.md) - the swisstopo data gate: tools, real inspect values, gate outcomes, the world binary format.
  - [ui.md](system/ui.md) - the HUD, the design tokens and the touch controls.
  - [leaderboard.md](system/leaderboard.md) - checkpoint restart, which time a board ranks, the server handshake and store.
- `sop/` - procedures.
  - [play-testing.md](sop/play-testing.md) - how to ride a leg with the dev autopilot.

Add a file when you learn something that the code does not show. Keep each file short.
