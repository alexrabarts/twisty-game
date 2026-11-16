# Rendering

All rendering goes through `Graphics` in `js/graphics.js`. `main.js` never calls `renderer.render` for the game scene.

## Colour

- `THREE.ColorManagement.enabled` is set at the top of `graphics.js`, before any `Color` exists. Hex and CSS colours are sRGB. Lighting runs in linear space.
- `Graphics.fixColorSpaces()` tags `map` and `emissiveMap` textures as sRGB and decodes float vertex colours once. It runs when a leg starts and again every 1.5 s, because particles and cones are created during a leg.
- Author float vertex colours in sRGB. Do not decode them yourself.
- `Color.setRGB` and `Color.setHSL` take linear values unless you pass `THREE.SRGBColorSpace`.

## Frame

1. The scene renders into a 4x MSAA half-float target. The renderer does no tone mapping.
2. Bloom: threshold, five-level blur chain, additive upsample. The threshold is 1.0, or the preset's `threshold` (night: 1.8, with bloom 0.6), so at night only lamp heads and the moon bloom; lit windows and headlit paint do not.
3. Composite: radial speed blur, height fog, light shafts, bloom, ACES tone map, saturation, contrast, tint, vignette, sRGB encode, dither.

`renderer.toneMappingExposure` is still the exposure control. `setTimeOfDay` sets it.

If the browser has no WebGL2 float render targets, `postEnabled` is false. The renderer then tone-maps to the canvas, and the CSS speed overlay in `main.js` is used.

## Depth atmosphere

`Graphics.setAtmosphere(atmosphere, render, baseY)` takes a leg's `config.atmosphere` and `config.render` from `Terrain.LEGS`, and `baseY`, the leg's lowest road height (`Game.lowestRoadHeight`). Pass `null` to reset. `main.js` calls it when a ride starts, when a track preview starts and when the rider showcase starts. Call it before `setWeather`: `applySky` reads `ringStrength`.

- **Depth texture.** `sceneTarget` has a `DepthTexture` (`DepthFormat`, `UnsignedIntType`) set in the constructor options. Rules: set it before the first render into the target and never attach it later; never use `DepthStencilFormat`; sample depth only in a pass that draws to another target (the composite pass draws to the canvas); `setSize` resizes it with the target.
- **Guard.** `atmosphereSupported` is false when `postEnabled` is false or the renderer has `WEBGL_multisampled_render_to_texture` (three r150 takes a different branch there). Then there is no depth texture, no `shaftTarget`, and height fog and shafts stay off. Material `FogExp2` still applies, so the game looks as before.
- **Height fog.** It lives in the composite pass: no new full-resolution pass or target. The shader rebuilds the world position from `tDepth`, `uProjInv` and `uCamWorld`, integrates a density that falls off exponentially with height along the view ray, and mixes toward `uFogColor` (`scene.fog.color`). It runs after the speed blur and before bloom and the tone map. Sky pixels (depth 1) reach `uFogReach`, which makes the mist band at the horizon. `heightFog` is `{ density, falloff }`: density per metre at `baseY`, falloff per metre of climb.
- **Light shafts.** `shaftTarget` is a half-float target at a quarter of the scene target's size. One pass marches 24 steps toward the sun's screen position and gathers bright sky pixels. The composite adds the result. `shaftsActive` is false when `atmosphere.shafts` is 0, the sun is behind the camera or the time of day uses the moon. Shafts are on for legs 1, 2, 4 and 5.
- **Far ring.** `Graphics.ringStrength` (default 1, `render.ring`) multiplies `uMountains` in `applySky` and in the thick-fog branch of `update`. The environment bake keeps it at 0. Only coastal-descent differs (0.35). A leg with `render.ringRise: [from, to]` (mountain-dawn: 0.15 to 1) starts the ring at `from`; each frame `main.js` calls `Graphics.setRingProgress()` with the bike's progress along the leg, and the ring rises to `to` at the finish.
- **Cull distance and shadows.** `main.js` clamps the cull distance to `render.cullMax` (600, or 800 on mountain-dawn, coastal-descent and winter-pass). `applyShadowBox` sets the sun's shadow box to `render.shadowSpan` wide (120, or 200 on foggy-gorge, with the shadow far plane at least 300 and twice the span). The shadow map stays 2048.
- **Weather.** `WeatherSystem.baseY` is the same `baseY`; `updateFogDensity` thins the fog above it.

## Sky

- `SKY_PRESETS` has one look for each time of day. `SKY_WEATHER` overrides it for rain, snow and fog.
- The horizon colour is always `scene.fog.color`. Distant geometry fades into the sky because of this. Change the fog colour, not the sky, to change the horizon.
- Gradient and clouds are baked into a 1024 x 512 panorama every 8 frames. The dome samples it and adds the sun or moon disc, stars and two far mountain ranges.
- The same sky is baked with PMREM into `scene.environment` when the time of day or weather changes.
- The sky mesh has `userData.isSky`. `setupPerformanceCulling` must skip it, and any mesh with `userData.skipCulling` (the instanced forest, the headlight beam).

## Rock face

On a leg with `rockFace` in `SceneAssets.LEGS` (foggy-gorge), the wall ribbon's material gets `onBeforeCompile` (`rockShader` in `js/sceneassets.js`): it replaces three's `map_fragment` and `normal_fragment_maps`. The vertex colours stay the look; a tiling detail map and normal map are read in shifting patches at a level distance and world height, so no part of a wall repeats and the beds stay level. `tools/blender/README.md` ("Rock face detail") has the rules and the cost.

## Lights

`timeConfigs` in `main.js` holds the light values. They are tuned for linear lighting: the sky light (hemisphere top) is the zenith colour, not the horizon colour.

`headlight` in a config switches on the one spot light and the visible beam cone. They are off in daylight because a spot light costs every lit fragment. The spot reaches 120 m with decay 2: a near-flat falloff lit a white house 60 m ahead as brightly as the road under the wheel, and the bloom turned it into a halo.

## Cost

The game is fill-rate bound on high-DPI screens. `adaptResolution` lowers the pixel ratio below 52 fps. It ignores the first 4 s of a leg, when shaders compile.

## Bikes and rider

`Vehicle.createMesh` builds the procedural bike and rider, then calls `BikeModels.dress` (`js/bikemodels.js`). That swaps in the Blender-made model from `assets/bikes/` (built by `tools/blender/bike_*.py` and `rider.py`; see `tools/blender/README.md`).

- **When.** The files start to load when the page opens. If they are in when a vehicle is built, the swap is immediate. If they arrive later, the swap happens then, but only if `update()` has not run for that vehicle. A bike that is on the road keeps its procedural model until the next `reset()`. A file that fails to load, or a model that lacks a part, leaves the procedural bike.
- **Contract.** The swap sets the same fields on the vehicle (`frontWheel`, `rearWheel`, `frontDisc`, `rearDisc`, `leftFork`, `rightFork`, `handlebar`, `headlight`, `brakeLight`, `frame`, `fuelTank`, `rider`, `helmet`, `visor` and the limbs) on the same pivots. `frame.material` is still the palette's paint material, so the crash and wheelie tints work. `brakeLight` has its own material. `vehicle.modelled` is true after a swap, and `vehicle.onModel` is called.
- **Rider.** The rider is a group of rigid segments, not a skinned mesh. `BikeModels` poses them once: the torso leans as `riderSpec.torsoLean` says, the hands go to the bike's `grip` mark and the feet to its `peg` mark. Elbows and knees are placed by the fixed lengths of the limbs. `updateMesh` moves and turns the rider group as before.
- **Materials.** Every modelled mesh has baked occlusion in its vertex colours (normalised bytes, which `fixColorSpaces` leaves alone) and its material has `vertexColors` on. Do not put a palette material on a mesh without a `color` attribute after a swap: it draws black.
- **Crew.** `AIMotorcycle` calls `BikeModels.crew`. The touring crew ride `crew.glb`, the sport bike at a fifth of the detail. All crew bikes share geometry and all finishes but the paint and the rider's kit.
- **Rider select.** The dimmed tier works from each material's lit colour (`userData.lit`), so it can run again after a late swap. The procedural bike darkens a material once for each part that uses it, as before. A modelled bike has few parts, so its palette materials get 0.03 and its other materials get 0.12. Set the tier through `vehicle.onModel` if you add another.
- **Off switch.** `node tools/terrain-check.mjs <probe> --no-assets` keeps the procedural bike and the procedural scenery, for a before and after measure.

## Traffic cars

`Car.createCarModel` (`js/traffic.js`) builds the procedural car, then calls `CarModels.dress` (`js/carmodels.js`). That swaps in a Blender-made model from `assets/cars/` (built by `tools/blender/car_*.py`; see `tools/blender/README.md`). Jest loads `traffic.js` without `carmodels.js`, so the other tests see the procedural car.

- **Bodies.** There are two: a hatchback and a van. The colour of the car selects the body (`CarModels.VANS` holds the four van colours of `Traffic.getRandomCarColor`). No random number is drawn for it.
- **When.** The files start to load when the page opens. If the file is in when a car is built, the swap is immediate. If it arrives later, the swap happens then, but only if `update()` has not run for that car. A car that is on the road keeps its procedural model until it goes off the end of the leg: `Car.update` hides it there and runs `car.modelWaiting`. A file that fails to load, or a model that lacks a part, leaves the procedural car.
- **Contract.** The swap sets the same fields on the car: `body`, `wheels` (four groups on the same hubs, which `update` spins) and the four indicators, each with its own material. `body.material` is the material of the procedural body, so the collision flash still reaches the paint. The headlights (`0xffffee`, 0.8) and the tail lights (`0xff0000`, 0.3) glow as on the procedural car. The rear indicators are the brake lamps. `car.modelled` is true after a swap and `car.kind` names the body.
- **Size.** The model stands on y = 0 and the car's origin is at hub height, so the model hangs 0.32 below the group. Both bodies are 4.3 m long and 2.0 m wide across the mirrors; the procedural car is 4.4 m and 2.0 m. The hatchback is 0.18 m lower than the procedural car, which rode 0.38 m off the ground. The van is 0.14 m higher. `Car.checkCollision` is a ball of 2.2 m about the origin and does not read the model.
- **Random numbers.** three takes each object's id from `Math.random`. `CarModels` gives three a generator of its own while a swap runs. Thus a swap does not move the numbers that `Traffic` draws next, with a seeded generator or at any arrival time.
- **Cost.** A modelled car is about 4700 triangles in 28 meshes; the procedural car is 2238 triangles in 57 meshes. All cars of one body share geometry and all finishes but the paint, the roof and the indicators.
- **Off switch.** `--no-assets` keeps the procedural cars too.
