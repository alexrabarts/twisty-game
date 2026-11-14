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

## Run-off, tunnel and bridge legs

- Valley-run, storm-valley, coastal-descent, winter-pass, foggy-gorge and night-ride have loose ground beside the road, not a wall. A bike on it slows to a floor speed and has low grip. After 6 s off the road it crashes with `Off the road for 6.0 s`. The road resets that clock.
- A lane past the road edge tests this: for example `twistyDev.autopilot({ speed: 25, lane: 14 })` on valley-run crashes at about 6 s once the bike is out on the run-off. Step the game to read `vehicle.offRoadTime`.
- Trees on run-off ground are solid: a trunk crashes the bike inside 1.6 m. Water (the valley-run river, the coast and gorge floors) crashes the bike at once.
- Night-ride has a tunnel around segment 517. The camera stays under the roof, so check High View there. Foggy-gorge has a bridge across the gorge around segments 285 to 292.
- `side > 0` in `twistyDev.view` is the right of the road, whatever ground is there.
