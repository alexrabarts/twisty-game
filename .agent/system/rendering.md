# Rendering

All rendering goes through `Graphics` in `js/graphics.js`. `main.js` never calls `renderer.render` for the game scene.

## Colour

- `THREE.ColorManagement.enabled` is set at the top of `graphics.js`, before any `Color` exists. Hex and CSS colours are sRGB. Lighting runs in linear space.
- `Graphics.fixColorSpaces()` tags `map` and `emissiveMap` textures as sRGB and decodes float vertex colours once. It runs when a leg starts and again every 1.5 s, because particles and cones are created during a leg.
- Author float vertex colours in sRGB. Do not decode them yourself.
- `Color.setRGB` and `Color.setHSL` take linear values unless you pass `THREE.SRGBColorSpace`.

## Frame

1. The scene renders into a 4x MSAA half-float target. The renderer does no tone mapping.
2. Bloom: threshold, five-level blur chain, additive upsample.
3. Composite: radial speed blur, height fog, light shafts, bloom, ACES tone map, saturation, contrast, tint, vignette, sRGB encode, dither.

`renderer.toneMappingExposure` is still the exposure control. `setTimeOfDay` sets it.

If the browser has no WebGL2 float render targets, `postEnabled` is false. The renderer then tone-maps to the canvas, and the CSS speed overlay in `main.js` is used.

## Depth atmosphere

`Graphics.setAtmosphere(atmosphere, render, baseY)` takes a leg's `config.atmosphere` and `config.render` from `Terrain.LEGS`, and `baseY`, the leg's lowest road height (`Game.lowestRoadHeight`). Pass `null` to reset. `main.js` calls it when a ride starts, when a track preview starts and when the rider showcase starts. Call it before `setWeather`: `applySky` reads `ringStrength`.

- **Depth texture.** `sceneTarget` has a `DepthTexture` (`DepthFormat`, `UnsignedIntType`) set in the constructor options. Rules: set it before the first render into the target and never attach it later; never use `DepthStencilFormat`; sample depth only in a pass that draws to another target (the composite pass draws to the canvas); `setSize` resizes it with the target.
- **Guard.** `atmosphereSupported` is false when `postEnabled` is false or the renderer has `WEBGL_multisampled_render_to_texture` (three r150 takes a different branch there). Then there is no depth texture, no `shaftTarget`, and height fog and shafts stay off. Material `FogExp2` still applies, so the game looks as before.
- **Height fog.** It lives in the composite pass: no new full-resolution pass or target. The shader rebuilds the world position from `tDepth`, `uProjInv` and `uCamWorld`, integrates a density that falls off exponentially with height along the view ray, and mixes toward `uFogColor` (`scene.fog.color`). It runs after the speed blur and before bloom and the tone map. Sky pixels (depth 1) reach `uFogReach`, which makes the mist band at the horizon. `heightFog` is `{ density, falloff }`: density per metre at `baseY`, falloff per metre of climb.
- **Light shafts.** `shaftTarget` is a half-float target at a quarter of the scene target's size. One pass marches 24 steps toward the sun's screen position and gathers bright sky pixels. The composite adds the result. `shaftsActive` is false when `atmosphere.shafts` is 0, the sun is behind the camera or the time of day uses the moon. Shafts are on for legs 1, 2, 4 and 5.
- **Far ring.** `Graphics.ringStrength` (default 1, `render.ring`) multiplies `uMountains` in `applySky` and in the thick-fog branch of `update`. The environment bake keeps it at 0. Only coastal-descent differs (0.35).
- **Cull distance and shadows.** `main.js` clamps the cull distance to `render.cullMax` (600, or 800 on valley-run, coastal-descent and winter-pass). `applyShadowBox` sets the sun's shadow box to `render.shadowSpan` wide (120, or 200 on foggy-gorge, with the shadow far plane at least 300 and twice the span). The shadow map stays 2048.
- **Weather.** `WeatherSystem.baseY` is the same `baseY`; `updateFogDensity` thins the fog above it.

## Sky

- `SKY_PRESETS` has one look for each time of day. `SKY_WEATHER` overrides it for rain, snow and fog.
- The horizon colour is always `scene.fog.color`. Distant geometry fades into the sky because of this. Change the fog colour, not the sky, to change the horizon.
- Gradient and clouds are baked into a 1024 x 512 panorama every 8 frames. The dome samples it and adds the sun or moon disc, stars and two far mountain ranges.
- The same sky is baked with PMREM into `scene.environment` when the time of day or weather changes.
- The sky mesh has `userData.isSky`. `setupPerformanceCulling` must skip it, and any mesh with `userData.skipCulling` (the instanced forest, the headlight beam).

## Lights

`timeConfigs` in `main.js` holds the light values. They are tuned for linear lighting: the sky light (hemisphere top) is the zenith colour, not the horizon colour.

`headlight` in a config switches on the one spot light and the visible beam cone. They are off in daylight because a spot light costs every lit fragment.

## Cost

The game is fill-rate bound on high-DPI screens. `adaptResolution` lowers the pixel ratio below 52 fps. It ignores the first 4 s of a leg, when shaders compile.
