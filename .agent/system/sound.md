# Sound

The game's sound and the gearbox behind the gear indicator. The code is in `js/sound.js`; the game feeds it once a frame (`Game.updateGearbox`, `Game.soundFrame` in `js/main.js`). The tests are `tests/unit/sound.test.js`. Clips for the ear: `node tools/sound-clips.mjs --out <dir>` ("The clips").

## The rules

- The rules are data in `js/sound.js`: the voices (`Sound.ENGINES`), the gearbox (`Sound.GEARBOX`, `Sound.AUTOMATIC`), the surfaces (`Sound.SURFACES`), the wind (`Sound.WIND`), the others on the road (`Sound.PASSING`), the cues (`Sound.CUES`), the mix (`Sound.MIX`), the ramps (`Sound.RAMPS`) and the settings (`Sound.SETTINGS`). A new bike or engine kind gets its voice from its facts. It needs no code.
- One graph of nodes is made when the sound first starts (`SoundManager.build`). After that a frame only moves parameters. No frame makes a node. An event (a cue, a crash, a tyre's squeal) makes its own short nodes and lets them go when they end.
- Every parameter moves with a ramp to the end of a short look-ahead (`Sound.RAMPS.aheadS`), never with a step. Before the ramp, its value moves at most `Sound.RAMPS[...]` per second (`Sound.slew`): the pitch in octaves, the gains in their own units, the filters in octaves. A frame is counted as at most 1/30 s, so no frame moves a value by more than its rate over 1/30 s. A fade out holds the value where it is (`cancelAndHoldAtTime`) before it falls. Nothing stops an oscillator during a ride, so nothing clicks at the start or the stop.
- Browsers start audio only after a gesture. The context is made on the first key, pointer or touch after the sound is on, or when the sound is turned on (the M key is a gesture). A hidden tab fades the sound out and suspends the context (`SoundManager.sleep`). The pause fades it out.
- Nothing throws without an `AudioContext` (node, an old browser): `SoundManager` then does nothing. A storage that throws keeps the settings for the page only.
- No audio file is loaded. Every sound is made here. The game has no music.

## The gearbox

The gearbox is for the sound and the HUD only. The physics' speed and its acceleration curve do not change: the gearbox reads the speed and the rider's hands and gives revs back. `Game.updateGearbox` runs it each frame, also when the sound is off, because the HUD shows it.

- Revs are the speed's share of the bike's top speed x the gear's ratio x `topShare` (0.92: the revs at top speed in top gear). They are a share of the redline.
- Six gears. Each gear's ratio over the next is a just interval: 4/3 (a fourth), 5/4 (a major third), 6/5 (a minor third), 9/8 and 10/9 (two tones). First is 2.5 x top. An upshift drops the pitch by that interval.
- Up: only while the throttle is open (over `throttle`, 0.08), when the revs reach `up.least` (0.55) on a touch of throttle to `up.most` (0.9) on full throttle. A closed throttle never shifts up.
- Down: when the revs fall under `down` (0.36). On the brake, also while the lower gear's revs stay under `brakeDown` (0.72).
- At least `holdS` (0.35 s) between two shifts, `brakeHoldS` (0.22 s) on the brake.
- The rules hold for every step: `up.least` / the largest step > `down`, and `down` x the largest step < `up.least`. So no speed has two gears that answer it, and a steady speed never hunts between two gears.
- In first, the clutch slips: at a standstill the revs rise with the throttle to `launch` (0.32).
- An upshift cuts the ignition (`cutLevel` 0.25 of the gain for `cutS` 0.06 s), and the revs fall to the new gear's over about `shiftS` (0.08 s). A downshift blips: the revs go `blip` (12 %) over the new gear's, the gain to `blipLevel` (1.25), for `shiftS`.
- A twist-and-go scooter (its class or kind `scooter`) has no steps (`Sound.AUTOMATIC`). On the throttle its revs hold in `band` (0.5 to 0.72 of the redline, by the throttle). Off it they fall toward the idle with the speed. Under `engage` (6 % of top speed) the clutch still slips.
- A crash or the finish puts the gearbox in neutral: the engine is off, the revs fall to the idle. The next ride starts in first.

## The gear indicator

The gear and the rev bar fill the slots `#hudGear` and `#hudRevs` beside the speed gauge (`.agent/system/ui.md`). `Hud.setGear(gearbox)` writes them, only when a value changes.

| State | `#hudGear` (`HudRules.gearText`) |
| --- | --- |
| No gearbox | nothing |
| A gear | its number, 1 to 6 |
| A scooter | D |
| Neutral (a crash, the finish) | N |

The rev bar is the revs as a share of the redline over a dim track, in the go colour. It turns amber (`data-light="shift"`) from `light` (0.86) in a gear that has one above it, and red (`data-light="limit"`) from `limit` (0.97). Top gear and the scooter never show the amber light.

## The voices

An engine's voice is a harmonic series on its cycle: two turns of the crank, rpm / 120 Hz. It is a `PeriodicWave`, never a raw square or sawtooth. Each kind is a row of `Sound.ENGINES`:

| Kind | Firing (degrees of the 720 of a cycle) | Strongest harmonic | Rev band (x idle) | Character |
| --- | --- | --- | --- | --- |
| `single` | 0 | 1 | 6 | a strong fundamental, an even thump, a round pulse |
| `parallel-twin` | 0, 180 | 4, then 1 and 3; none at 2 or 6 | 6 | busy and uneven, a slight beat |
| `v-twin` | 0, 270 | 3 and 5; none at 4 | 6 | a broad heavy pulse, a slower beat, a low exhaust |
| `triple` | 0, 240, 480 | 3 | 7 | the pulses not quite equal, which gives the howl |
| `four` | 0, 180, 360, 540 | 4 | 8 | smooth, brightest at the top |
| `v4` | 0, 90, 290, 380 | 7 and 8, then 2; none at 4 | 8 | paired pulses, a beat |
| `car` | as a four, at a car's revs | 4 | 8 of a half idle | muffled, for the traffic |

- A harmonic is the sum of the pulses' phasors at it (each pulse at its own `levels` strength) times the pulse's roll-off, which halves at harmonic `corner` on a closed throttle and `corner` x `open` on full load. Two tables per kind: full load (brighter) and closed throttle (rounder). Both share one scale, set so the full-load table's magnitudes sum to 1, so the wave never peaks over 1.
- The engine plays both tables at one pitch and crossfades them with the throttle, plus a copy of the full-load table detuned by `beat` cents at `beatLevel`, for a slight slow beat.
- Two fixed resonances (`exhaust`, `intake`: Hz, Q, dB) stay where they are while the pitch moves, as a real exhaust's do. The intake's lift opens with the throttle.
- A tone filter opens with the load (9 to 36 x the cycle's pitch, 350 Hz to 6 kHz). A soft saturation (tanh, `drive`) rounds the peaks; the level into it (`Sound.MIX.drive`) keeps the wave in the curve's soft part, never at its flat end.
- On a closed throttle at high revs the exhaust pops (`burble`): short swells of noise at three times the exhaust's band, on one gain.
- A bike's kind is its `engine` fact: `BIKE_MODELS[id].engine`, or `Vehicle.BIKES[kind].engine` for a procedural kind. A bike without it is heard as a `four`.
- Musical tuning, where it costs nothing: an idle of 1650 rpm puts each engine's firing on an A or its fifth (a four fires at 55 Hz, A1; a twin at 27.5 Hz; a triple at 41.25 Hz, E). Each rev band is a whole harmonic of the idle. The gear steps are just intervals. The cues are in A major.

## The signal chain

```
engine: full-load wave + closed-throttle wave + beat copy -> drive gain -> exhaust peak -> intake peak -> tone lowpass -> tanh -> engine gain --+
pops:   noise -> band at 3 x exhaust -> pop gain -----------------------------------------------------------------------------------------+-> engine bus --+
others: 3 voices, each wave -> lowpass by distance -> pan -> gain (Doppler on the pitch) ---------------------------------------------+                 |
wind:   noise -> highpass 380 Hz -> lowpass rising with speed -> wind gain --+                                                                          +-> master -> compressor -> speakers
road:   noise -> band of the surface -> stone rumble (LFO on a gain) -> road gain --+-> effects bus ----------------------------------------------------+      |
wet:    noise -> highpass 2.6 kHz -> wet gain --+                                   |                                                              master -> reverb send -> convolver -> compressor
scrape: noise -> band 1.9 kHz -> scrape gain ---+-----------------------------------+
cues, crash, squeal: short event nodes -> effects bus
```

- The compressor (`Sound.MIX.compressor`: -16 dB, ratio 3, knee 10) keeps peaks soft. The reverb is a made impulse of 1.3 s: stereo noise that falls away and grows duller, after 12 ms of silence (an open valley's answer), at a send of 0.16.
- One loop of noise (2 s, made once) feeds the wind, the road, the wet, the scrape and the pops.

## The rest of the ride

- The wind: band-limited noise over 380 Hz, its top rising from 900 Hz to 3.6 kHz with the speed. Its gain is `level` x the speed share squared, at most `underEngine` of the engine's gain plus `floor`, so it never masks the engine.
- The tyres on the road (`Sound.SURFACES`), by `Sound.surfaceOf(vehicle)`: `asphalt` a soft roar, `cobbles` a lower roar with a rumble at the speed over the stones' spacing (0.16 m), `loose` (the land off the road: gravel or grass) a bright crunch with a fast rumble. `wet` lays a hiss over any of them when the weather takes grip (the same test as the tuning's wet grip).
- A slide: the tyres scrubbing on the land (the power slide's angle), or the bike on its side after a fall (its speed), raise a scrape.
- The crew's and the cars' engines (`Sound.PASSING`): the three nearest within 140 m, each on its own engine kind (the car its own voice), each with a gearbox guessed from its speed. The level falls with the distance from 7 m, a lowpass closes with it, the pan is the side of the road it is on, and the pitch has the Doppler shift (343 / (343 + its speed away), held to 0.8 to 1.25). A voice keeps its source while it is among the nearest, so a pass is heard whole.
- The crash: a soft low thud (A falling to D) and a short burst of dulled noise; the scrape follows while the bike slides. A wall brush: a short narrow squeal falling from E6.
- The cues (`soundManager.cue(name)`, `Sound.CUES`): `checkpoint`, `jump`, `cone`, `select`, `confirm`, `back`, `unlock`, `brake`, each notes of A major on a soft bell voice (a fundamental and two quiet overtones). A new cue is a row.

## The settings

`Sound.SETTINGS` is the table a menu shows, one row each: `{ id, label, kind, range, step, default }`.

| id | Label | Kind | Range | Default |
| --- | --- | --- | --- | --- |
| `muted` | Mute | toggle | | on (the game starts silent, as before) |
| `master` | Volume | slider | 0 to 1, step 0.05 | 0.7 |
| `balance` | Engine and effects | slider | 0 (effects only) to 1 (engine only), step 0.05; `ends` names the two ends | 0.5 (both at full) |

- `soundManager.setSetting(id, value)` holds the value to its row (a toggle a boolean, a slider in its range on its step; anything else the default), keeps it in localStorage (`twistySound`, JSON) and applies it at once. It returns the value it took. `getSetting(id)` reads one. `watchSettings(fn)` hears each change (the M key's too) and returns a function that stops it.
- The master gain is the volume squared: the ear hears that as even steps. The balance at 0.5 leaves both buses at full; toward an end the other bus falls to nothing.
- The M key toggles `muted` and keeps it.
- The sound has no dialog of its own: the graphics menu shows these rows.

## The clips

`node tools/sound-clips.mjs --out <dir> [--before <an older js/main.js>]` renders 10 s clips (48 kHz stereo WAV) in an `OfflineAudioContext` of a browser page, with the real `js/sound.js` driven at 60 frames a second. Each kind rides the same throttle: 1 s at idle, full throttle through the gears to 6.5 s, the throttle shut (the overrun, the pops) to 8 s, the brake (the downshifts, the blips), the engine off at 9.7 s. `passing` holds 20 m/s while two of the crew pass and a car comes the other way. `engine-only/` has each without the wind and the road. `--before` rides an older engine on the same throttle.

`report.json` gives for each clip:

- `hnrDb`: the harmonic-to-noise figure. The wave against itself one period of its fundamental earlier (the engine's own pitch track): their sum is the harmonic part, their difference the rest. In the spectrum that is a comb with a tooth at each harmonic against the gaps between the teeth. White noise gets 0 dB. `steadyHnrDb` leaves out the 100 ms blocks whose pitch moves more than 1 %, where the glide smears the comb.
- `autocorrHnrDb`: how periodic the wave is, from its autocorrelation. A gliding pitch lowers it.
- `centroidHz`, `over2k`: how bright a clip is. A raw sawtooth is perfectly harmonic and still harsh, which the harmonic figure cannot say.
- `clicks`: each sample step over 0.02 and over 12 times every step of the 100 ms before it (an edge the wave repeats each period has met its like before; a step out of nothing has not), and the level of the first and last samples.
