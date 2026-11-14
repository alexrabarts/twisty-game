# Play-testing with the autopilot

`tools/autopilot.js` is a dev helper. The game does not load it.

1. Run `npm run serve` and open `http://localhost:8080`.
2. In the console:

```js
const s = document.createElement('script'); s.src = 'tools/autopilot.js'; document.head.appendChild(s);
twistyDev.start('valley-run');          // any leg id from js/tours.js
twistyDev.autopilot({ speed: 30, lane: -3 });
```

- `speed` is in m/s. Use about 20 for High Pass (hairpins) and about 24 for the rain and snow legs.
- `lane: -3` is the riders' lane. `lane: 1` meets the roadworks ramp and the oncoming car.
- `twistyDev.view(side, up, back, ahead)` pauses the game and looks at the bike from beside the road. Use it to check scenery.
- `twistyDev.teleport(segment)` moves the bike.

Rockfalls can crash the autopilot. Set `game.rockfalls = null` for a run without them.
