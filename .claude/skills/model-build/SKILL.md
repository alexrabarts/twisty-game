---
name: model-build
description: Build or improve a Blender model for the game (a bike, the rider, a car, a building, a prop, a tree, the hill ride's boy) so it looks real in the game's own renderer at its triangle and file budget. Use when a model looks plastic, flat, blocky or fake, when adding a new model, or when the owner asks for more detail on one. Works in rounds against references, one change at a time, with measured checks and the critic-panel skill as the judge.
---

# Model build

A model is done when it looks right **in the game**, at the distance the player sees it, inside its budget. Blender is where it is made; three.js r150 is where it is judged. Read `tools/blender/README.md` first: it holds the node and material contract for each kind of model, the budgets, and the tests that guard them.

## 0. Before the first change

1. Name the model, its script in `tools/blender/`, its output in `assets/`, and the game code that reads it (`js/bikemodels.js`, `js/carmodels.js`, `js/sceneassets.js`, `js/treemodels.js`, `js/hill/`).
2. Write the budget from the README and the tests: triangles per level, file size, draw calls (one per material per node), texture size. A change that cannot fit is a change to the budget, and that is the owner's call.
3. Write the bar in a few lines: what the player must see at each distance (the menu close-up, the chase camera, the far crew). Each line names a distance and a property that can be checked from a picture.
4. Gather references. The owner's photos are in `~/Pictures/twisty-reference/` and are private: read them, never copy them, a crop, a traced outline or a sampled texture into the repo. Only numbers (sizes, ratios, colour values) and neutral words enter the repo. No maker's name, logo, wordmark or sign text on any model. Never model a real person's face.
5. Take the **before** pictures (section 3) so every later round compares against them.

## 1. Geometry: shape first, then edges

- The silhouette carries the model at a distance. Fix the outline at chase distance before any surface work.
- Spend triangles where the outline and the light catch them: a curve on the silhouette, a bevel on a hard edge. Take them from faces the camera never sees close up. A flat face needs few.
- Bevel every hard edge that faces the light, small (a few mm on a bike, a few cm on a house), so the edge catches a highlight. A perfectly sharp edge is the most common tell of a code-made model.
- Parts that touch must meet: no gap and no float where a part sits on another. Contact reads as weight.
- Keep each level of detail a real simplification of the one above, with the same outline and the same colours. Check that each level switches at the distance the game uses.

## 2. Surfaces: layers, baked to maps

The game cannot run Blender's shader nodes, so every surface layer is **baked into textures** (base colour, a normal map, and occlusion with roughness and metalness packed into one map) or into vertex colours, within the texture budget. Build each layer as a separate, named step in the script so it can be switched off and compared:

1. **Base colour varies.** Two or three tones of the material mixed by a large noise or a mask, then a regional tint. Never one flat colour on a large area.
2. **Speckle.** A mid-scale noise held to a narrow band about 1.0 (roughly 0.85 to 1.15), multiplied into the colour.
3. **Cavity.** Darken creases and corners from baked occlusion or curvature, multiplied into the base colour, so it reads in shade as well as in sun.
4. **Bump at two scales.** The large forms first, then a fine grain on top at well under its strength, both baked into the normal map.
5. **Roughness varies.** From the same noise as the colour, plus wear: rough in cavities, smoother where hands, boots or tyres touch.
6. **Wear on edges.** A mask from curvature that lightens paint and brightens metal on exposed edges. Dirt low down and where water runs.

A surface that still looks plastic after one fix needs research: find how material artists build that surface, write what you learned in the progress log, and rebuild it their way. Do not try the same fix twice.

## 3. Look in the game, not in Blender

- Render the model in the game's own renderer: the menu stage for a bike and rider, the chase camera in a ride, the far crew at its distance, the hill ride's own cameras for the boy. `tools/model-look.mjs` puts one model in the game's light at set views and saves each picture with a mask of the model (`tools/blender/README.md`, "Rounds on a model"); `world-model-shots`, `leg-model-shots` and `hill-look` do it in a ride.
- Always the same views and light each round, so pictures compare: front three-quarter, side, rear three-quarter, a close-up of the busiest part, and the game's own distances.
- Look at every picture at full size before saying anything about it.

## 4. One change, two or three values

- Each round changes one thing (a bevel width, a speckle range, a roughness level). Render the same views with two or three values, put them on one sheet with their values as labels, and pick by eye.
- Never change two things in one comparison. Never keep a change you did not compare.
- When something looks wrong and the cause is unclear, switch layers off one at a time (speckle, cavity, fine bump, wear) and measure a region, until the number moves. Do not tidy while you diagnose.

## 5. Measure

- Per picture: share of clipped highlights, share of crushed blacks, mean luminance, saturation, and the share of flat pale pixels in each tile of a grid. A tile that is flat is bare surface. `tools/model-stats.mjs` prints them.
- Per model: triangles per level, draw calls, file size, texture bytes. Write them every round.
- Label every number as measured or estimated. A number not written down did not happen.

## 6. The ledger

Keep one line per round in the progress log entry for the job: what changed, the values compared, the pick, the numbers, and the critics' result. Keep each round's pictures in their own folder under `~/Library/Caches/twisty-world/model-rounds/<model>/rNN-<what>/`. Going back is a copy of a folder, never a memory.

## 7. Judging

The builder never grades its own model. At each milestone and before the owner sees anything, run the `critic-panel` skill on the before and after pictures and the references. Its ranked fix list is the next round's focus. When the scores stop rising, at most two more rounds, each with a different method, then stop and write the faults that remain.

## Done

- The model passes every test that guards its kind (`tests/unit/bikemodels.test.js`, `characters.test.js`, `crew.test.js`, `bike-stands.test.js`, `hill-boy.test.js` and the rest the README names), and its budget.
- The critic panel's median meets the bar, with no verified P0 open.
- Before and after sheets at every view are in the rounds folder, and the owner has seen them.
- The progress log has the ledger. The privacy check prints nothing.
