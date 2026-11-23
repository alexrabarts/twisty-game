# .agent

Notes for people and AI agents who work on this repo.

- `system/` - how the game is built.
  - [graphics.md](system/graphics.md) - the quality ladder: the graphics levels, how the frame time steps them, the start level by device, what each part of a world frame costs on a phone-class page, what each effect costs and how the ladder drops the dearest first.
  - [rendering.md](system/rendering.md) - colour management, sky, lighting, post-processing, the effects and the settings dialog, the modelled bikes and the modelled traffic cars.
  - [world.md](system/world.md) - the terrain model and the rules for scenery placement.
  - [world-data.md](system/world-data.md) - the swisstopo data gate: tools, real inspect values, gate outcomes, the world binary format.
  - [ui.md](system/ui.md) - the HUD, the design tokens and the touch controls.
  - [handling.md](system/handling.md) - the tuning table (multipliers over the handling's numbers, the debug panel's and a rider mode's), the rider modes (the table, how they stack, how to add one), how a bike's weight and spare power shape its wheelie, how to set the two facts for a new bike, how the bike stands on a world's drawn ground (pitch from both tyres, lean from the ground's normal, the foot down), how the rider falls in a crash (the cause classes, the kinds, the table of keyed poses), the rider's weight in the handling (bike plus rider), a bike's own lean limit (the scooter), and a rider who cannot reach the ground on a slope.
  - [group.md](system/group.md) - the group ride of a world's crew: each rider's numbers (gap, limits, noise, spells, passes, stops), the line, the player's pull, waiting for a stopped player in a stopping place, passes back toward each rider's place and where a pass is safe, the slowest rider's stops, the seed.
  - [sound.md](system/sound.md) - the sound engine: the voices by engine kind (a harmonic series from the firing order), the gearbox of the sound and the HUD (ratios, shift rules, the scooter), the gear indicator, the signal chain, the wind, the tyres by surface, the others passing with their Doppler shift, the cues, the settings and their API, the offline clips.
  - [leaderboard.md](system/leaderboard.md) - checkpoint restart, which time a board ranks, the server handshake and store.
- `sop/` - procedures.
  - [play-testing.md](sop/play-testing.md) - how to ride a leg with the dev autopilot.
  - [photo-match.md](sop/photo-match.md) - how to match the game against the owner's photos, round by round, and size an import to cover them.

Add a file when you learn something that the code does not show. Keep each file short.
