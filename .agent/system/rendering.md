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
3. Composite: radial speed blur, bloom, ACES tone map, saturation, contrast, tint, vignette, sRGB encode, dither.

`renderer.toneMappingExposure` is still the exposure control. `setTimeOfDay` sets it.

If the browser has no WebGL2 float render targets, `postEnabled` is false. The renderer then tone-maps to the canvas, and the CSS speed overlay in `main.js` is used.

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
