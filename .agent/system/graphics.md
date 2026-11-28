# Graphics levels

The quality ladder is in `js/quality.js`. It has one table of graphics levels, `Quality.LEVELS`. Each level is the full set of settings that the game draws with. The frame time moves the game up and down the ladder. `Game.applyQuality` is the only code that puts a level in force.

## The levels

The lowest level is index 0. Full is the game as it was drawn before the ladder. The two levels over it add only the dearer effects of `js/effects.js` (see "The effects on the ladder").

| Level | `pixelRatio` | `shadowMap` | `msaa` | `bloom` | `treeShare` | `treeNear` | `effectMs` |
|---|---|---|---|---|---|---|---|
| 0 Lowest | 0.75 | 0 (none) | 0 | off | 0.4 | 0 | 0.2 |
| 1 Low | 1 | 0 (none) | 0 | on | 0.6 | 0 | 0.2 |
| 2 Medium | 1.25 | 1024 | 0 | on | 0.8 | 16 | 0.2 |
| 3 High | 1.5 | 2048 | 4 | on | 1 | 32 | 0.2 |
| 4 Full | 2 | 2048 | 4 | on | 1 | 48 | 0.4 |
| 5 Rich | 2 | 2048 | 4 | on | 1 | 48 | 0.7 |
| 6 Ultra | 2 | 2048 | 4 | on | 1 | 48 | 99 |

- `pixelRatio` is a cap. The game never draws more device pixels than the screen has.
- `shadowMap` is the size of the sun's shadow map. 0 turns the shadows off. Every material compiles again once at that change.
- `msaa` is the sample count of `Graphics.sceneTarget`. A change makes the target again on the next frame (`Graphics.setQuality`).
- `bloom` off skips the five bloom passes. The composite then adds no bloom.
- `treeShare` is the share of a world window's trees that the game draws. `Scenery.rankTrees` puts the trees in order from the bike, so the far trees go first. `Game.thinTrees` gives the share to the scenery (`Scenery.setTrees`). A tree is never solid. A classic leg has its own trees and does not use it.
- `treeNear` is the most trees of a world window that the game draws at the near level of detail (see "The trees' levels of detail"). Low and Lowest draw none: their nearest trees are at the mid level, the shapes the legs draw.
- `effectMs` is the most GPU time (ms, as measured) one effect may cost under the Auto preset. An effect dearer than it is held at a cheaper level, or off (`Effects.resolve`). A fixed preset does not read it.
- A tube's relief (the normals of its concrete and rock, `TubeShade.setDetail`) is drawn only at a level with a shadow map (Medium and over); its colours, bays and stains at every level. A uniform: nothing compiles.
- `Quality.FIELDS` holds the permitted values. A lower level never has more of a setting than a higher level. `tests/unit/quality.test.js` holds both rules.

To add a setting, add a column to every level and a row to `Quality.FIELDS`, then read it in `Game.applyQuality`. Keep the Full level equal to the game before the change.

## The trees' levels of detail

A world draws each species of tree (`Scenery.SPECIES`: spruce, larch, pine, fir, beech and ash) at three levels from `assets/trees/alpine.glb` (`tools/blender/tree_alpine.py`, `tree_species.py`):

| Level | Triangles | What it has | Drawn for |
|---|---|---|---|
| near | 750 to 1 270 | the trunk to the leader, each branch a spray with a sawtooth edge, leaf clumps with sky between them | the `treeNear` nearest trees within 140 m (`TREE_NEAR_M`) |
| mid | 164 to 212 | skirts of boughs, or one leaf clump to a lobe: the shapes the legs draw | the next 200 times the share within 420 m (`TREE_MID_CAP`, `TREE_MID_M`) |
| far | 44 to 66 | three notched skirts, or three clumps on the trunk | the rest |

- The shrubs (`Scenery.SHRUBS`: the alpine rose, from `assets/trees/shrubs.glb`) take the same three levels and the same rank: near 740 triangles, mid 112, far 20. Low and Lowest draw them at the mid level at the nearest, as the trees.
- One instanced mesh for each part of each shape at each level holds the window's trees (`Scenery.forest`, `trees:<shape>:<level>`). Before, each tile had a mesh for each shape. The window thus has fewer meshes and draw calls.
- `Scenery.rankTrees` chooses again when a tile comes or goes and for every 8 m the bike moves. It draws the nearest trees first. At their far level they share the triangle cap (`TRIANGLE_CAP`) with the houses and the boulders, after room for 16 near trees (`TREE_NEAR_KEPT`). A tree moves up a level only while the cap has room for it. So the window never holds more than the cap.
- Each tree has its own girth (0.88 to 1.12 of its height's width) and its own tint (`Scenery.treeTint`: 0.8 to 1 of its colours, toward blue or yellow). The tint is never over 1 in a channel, so no tree goes past its kind's caps.
- The near level is drawn darker against the palette (`Scenery.LEVEL_SHADE`). Its branches look up more than the mid level's skirts and the sky lights them more. At the palette's middle a near spruce stood lighter and yellower than the same tree one level further off.
- The larch has its own palette (`Vegetation.PALETTE.larch`), a lighter and yellower green. Over 1 650 m (`LARCH_FROM_M`) it takes a larger share of the conifers.
- Before the levels, a tile took its trees when it was built, at about 200 triangles each, until the caps were full. A tile built while the far tiles of the last window held the caps had no trees. Now every tile keeps its tree sites and the rank chooses over the window, so the nearest trees are always drawn.

Measured before and after on the same machine (Apple M-series GPU, the frame time as `world-quality` reads it, `world-budget --every 1000`):

| Measure | Before | After |
|---|---|---|
| Tremola, `world-budget` peak: triangles, instances, meshes | 469 783, 873, 685 | 458 375, 1 239, 673 |
| Gotthard leg, `world-budget` peak: triangles, instances, meshes | 448 971, 1 130, 605 | 448 289, 1 314, 596 |
| Trees drawn in a window, at the most (Tremola, Gotthard leg) | 529, 872 | 900, 900 |
| 2880 x 1800 at s 1319 (`--desk --measure`): frame, GPU | 14.8 ms, 10.2 ms | 13.4 ms, 9.7 ms |
| 960 x 540 at s 1319 (`--measure`): frame, GPU | 9.2 ms, 4.7 ms | 8.1 ms, 4.5 ms |
| Phone (`--phone`, two runs): Low frame | 11.7 and 9.0 ms | 10.9 and 9.5 ms |
| Phone (`--phone`, two runs): Lowest frame | 10.5 and 8.8 ms | 9.6 and 9.1 ms |

- The quality level was held at its start (Ultra on the desk) for every count.
- The Tremola was still over 450 000 triangles at km 2 and km 4 after this change. The window's room now holds every world under it: `.agent/system/world-data.md`, "The window's room".
- A tree costs about 0.1 ms or less of GPU time to draw at s 1319 in each run (`trees-none`). The runs drift by more than that.
- On a phone, Low and Lowest draw no near trees, and their far trees are cheaper than before. The frame time at each level stays inside the runs' drift.

`node tools/terrain-check.mjs world-tree-shots --world tremola --gpu --desk [--at s,s] [--out <dir>]` takes the chase view, a close view of the nearest tree and a middle view of the densest group 60 to 110 m out, at each station, with the window's counts. `tests/unit/treemodels.test.js` holds the levels' budgets and outlines, `tests/unit/world-meshes.test.js` the rank.

## The window's scenery comes and goes without a pop

The window's houses, boulders, tufts and trees are chosen again for every 8 m the bike moves, for every tile that comes or goes, and when the window's room changes (`Scenery.rankCaps`, `rankTrees`). Before this rule the furthest of them came in or went out at once, wherever they stood. `node tools/terrain-check.mjs world-pops --world <stage> --gpu [--from s] [--to s] [--stand 45] [--villages] [--out <dir>]` rides a stretch with every frame drawn and logs each change: what it was, its distance, whether it was in the view, and its cause. It reads the modelled trees, the houses (the far ones too), the boulders, the tufts and the forest's crown clumps. With `--stand` it stops the bike every 1 000 m, waits until the tiles hold still, then steps the quality ladder down and up, `--stand` frames at each level; it reads the frame as well as the things. With `--villages` it rides every village of the stage at 15 and 30 m/s. It fails on a pop in view in the ride, on a thing that comes or goes in view on a stand, and on a house first drawn in view within 250 m of the camera.

Measured on the first 4 km of the Tremola and of leg 3 (the far chase, 18 m/s, the player on the scooter):

| Measure | Tremola before | Tremola after | Leg 3 before | Leg 3 after |
|---|---|---|---|---|
| Pops (a thing's drawn share moves by more than half in one frame) | 41 348 | 24 521, all out of view | 46 469 | 19 920 |
| Pops in view | 14 631 | 0 | 16 889 | 1 (a far tree at 675 m, a tile let go of) |
| In view and out again within 2 s | 4 242 | 0 | 7 637 | 0 |
| Pops in view from the room | 598 | 0 | 335 | 0 |
| Fades in view | 0 | 20 439 | 0 | 15 238 |

The causes before: the rank's own churn as the bike moved (34 to 51% of the pops in view), tiles coming, going or built again (45 to 64%), the room (2 to 4%). Of the room's changes, 80% came from the land's tiles changing their level of detail, the rest from road sections and structures. The riders moved the room in neither ride.

The rules (`js/world/scenery.js`, at `Scenery.FADE_S`):

- **Held in view.** A thing drawn and in the camera's view (`Scenery.setView`, widened by `VIEW_WIDEN` of its distance for the camera's turn between two ranks) stays until it leaves the view or passes `HOLD_REACH` (1.3) times its kind's reach. A change of the room never cuts it. A step down the quality ladder (the trees' share) does, with a fade, once the bike moves on.
- **A stopped bike's view holds still** (`Scenery.holdsStill`). While the bike stays in its 8 m square and no tile comes or goes, a choice made again (a step of the ladder, a change of the room, a fade that ends) brings nothing into the view and takes nothing out of it, by a pop or a fade: a held thing stays at its level (a tree may still change its level, in a fade), and a thing in view that is not drawn is not taken. Out of view the choice changes at once. While the view holds still, the reach of the last choice holds nothing back either. The owner saw distant trees pop in with the bike stopped on the Tremola. The ladder steps by the frame time, and on a busy machine it stepped seven times in 80 s with the bike standing. A step of the trees' share took trees in view away or brought them back (two trees at 510 to 520 m on a stand at the owner's place). A dither over 0.5 s of a tree a few pixels high, in a frame where nothing else moves, reads as a pop. The probe rode at one level and never stood still, so it never saw this.
- **A tile built again.** A side road that changes near a tile builds its scenery again, and the new build can lose a tree, a boulder or a house the old had. What it loses fades out in view, as the things of a tile let go of do (`Scenery.leave` with what the new build keeps); before, it went at once (a far tree at 674 m on leg 3, in every ride).
- **Tufts are drawn within 400 m** (`TUFT_DRAW_M`). At a leg's end the ride has few near rows, and the tufts' cap went to tufts 2 km off, which a tile let go of took at once (197 pops in view on leg 1's last 400 m).
- **Held houses keep to the room.** A held house stays whole only within `HOLD_OVER` of the houses' share, standing or riding; past it the furthest go to their far level, in a fade. Kept whole whatever the room on a stand, a room that fell after a put-down left the houses 13 000 triangles over their share on leg 7.
- **Each thing its own fade.** A thing's fade is kept by its kind and place: a tuft's key is `u`, not `t` (the trees'), and a second of a kind at one place has its own. A tree and a tuft at one place shared one fade, and a tuft on leg 8 came in whole and went in a frame.
- **A thing that changes its level and goes.** A tree or a house that changes its level is drawn whole, its two levels in complementary pixels. When it is cut during the change, it goes from the level that has more of its pixels (`Scenery.settleSwap`). Before, it went at once.
- **The forest's crown clumps** (`TerrainMesh.clumps`, on the middle tiles from 700 m to 2 km) are part of the land's mesh. They came and went with their tile, at once: 7 077 pops in view on the Tremola's first 4 km, which the probe did not read before. The land's shader now draws a clump by a dither at the share its tile's distance from the bike gives (`TerrainMesh.clumpShare`): none where a tile changes its level (`WorldStreamer.TILE_LOD_M`), all of it `CLUMP_FADE_M` (120 m) further on. A tile that comes into the window fades its clumps in over 0.5 s, and a tile that the window lets go fades them out in its 3 s of grace (`TerrainMesh.stepClumps`, each frame from `Game`).
- **Room from out of view.** The held things take their room first. The rest is chosen nearest first in the room that is left, so what the room is short of is taken from what is out of view, the furthest first. Held things may stand `HOLD_OVER` (6 000 triangles) over the room at the most; past that the furthest of them fade out.
- **Fades.** A thing that comes or goes in view, and a tree that changes its level in view, fades over 0.5 s. Out of view it changes at once. A change of level that comes during a fade waits for the fade to end.
- **Tiles.** A tile built again keeps its things and their fades. The things of a tile the window lets go of fade out.
- **The room.** `Game.budgetWindow` counts the riders (the player's bike and rider, the crew, the cars) as a fixed share, `riderRoom`: every one of them as drawn, the most seen in the ride (51 022 triangles in both rides). They move in and out of the window every few seconds, they are not scenery, and a fixed share always holds them. The rest is the median of the last three measures (one a second), so a section's old mesh beside its new one for a moment moves nothing; `setWindowRoom` keeps its own hysteresis.
- **The player's bike** draws 30 776 triangles with its rider on the scooter. It is constant in a ride and moved the room in neither ride. The trail single's detail (bike15, lod0 19 296 triangles, 4 964 more than before) takes those 4 964 from the scenery's room for the whole ride: about one house, or about 90 far trees.

**The fade.** A screen-door dither in the materials the things are drawn with (`Scenery.fadeable`): a fragment whose interleaved gradient noise is under the cut is discarded. No blending, so no sorting and nothing drawn twice in a pixel. A level change draws the two levels in complementary pixels, so the tree is never thinner or doubled. A thing's share is carried in the fourth row of its instance matrix (an affine matrix has 0 there, and the shader sets it back to 0 before it uses the matrix); a tuft's and a house footing's in a vertex attribute, `fadeCut`. Each frame `Scenery.stepFades` writes the shares that move, with no allocation. The sun's shadow fades with the thing (`Scenery.fadeDepth`). The crew's bikes have no switch to fade: they draw their far file only. The player's bike changes from lod0 to lod1 30 m from the camera, which the chase views never reach.

**The cost.** `world-frametime --world tremola --gpu --desk` on the Mac mini (2880 x 1800, the median of five places), before and after in turn, two runs each: 18.4 and 18.6 ms before, 18.6 and 18.4 ms after. `world-budget` holds the Tremola and leg 3 at 436 000 or under, and `world-steps` holds every step under 16 ms: the caps' choice reads and settles `STEP_THINGS` (400) things a step (read whole, it took 47 ms).

**The levels agree.** `tests/unit/scenery-levels.test.js` holds each lower level to the level above: the trees and the shrub as the world draws them (height within 10%, spread within 20%, base and middle within 2% and 7%, mean colour within 20% and its tint within 0.03), the crew's far bikes against the detail file's lod1 they are made from, and lod1 against lod0 (within 6%, 1%, 15% and 0.06). Drawn in the world's light at the distance each changes (140 m and 420 m), the trees' levels stood within 6% of each other in height and their bases on the same row of pixels. Three far bikes (duke390, panigale_black, z650) are 17 to 21% darker than their lod1 and the z750's lod1 21% darker than its lod0, in `KNOWN`, which may only shrink: `tools/blender/far.py` gives each new corner the occlusion of the nearest old one.

## Houses in a village

The owner saw houses appear near the bike in the villages. The cause was the houses' share of the window (`HOUSE_TRIANGLES`, 77 000), not the stream: a house model is about 4 000 triangles, so the share held about 19 whole houses, nearest first. In a village the next house came in when it was the 19th nearest, 26 to 100 m from the bike. With the streamer settled at every 10 m (so no build was late), houses were first drawn in view within 250 m on every leg with a village: 54 on leg 2 (Andermatt), 146 on leg 3, 187 on leg 6, and more where the room was short.

Now every house within `BUILDING_REACH_M` (450 m) is drawn, `HOUSE_FAR_CAP` (400) at the most. The nearest within `HOUSE_NEAR_M` (300 m) are drawn whole while the share has room, and the rest at a far level (`Scenery.houseLevels`). The far level is made from each model in code: a box of its walls and a gable roof from its eaves to its ridge, each in the area-weighted mean colour of the model's faces it stands for, 14 triangles. All the far houses are one mesh (`Scenery.farHousesMesh`), with each house as a run of its vertices and its share in `fadeCut`, so a village of a few hundred houses adds no instance to the window's 1 400. A plain hut or wall block far off is in that mesh too, its materials' colours baked into its vertices (`Scenery.bakedPart`): drawn instanced, the huts took two instances each past the parts' cap, and the Tremola stood at 1 406 instances in node. The houses spend no more of the window than the whole houses nearest first came to before, the far ones included (`spend` in `rankCapsSteps`): spent to the share's last triangle, the far houses took the room the trees had (21 far trees from 743 m at the Gotthard leg's km 3, 11 in the chase view). A house that changes its level in view fades from the one level to the other, with its footing whole. On a stand a house keeps its level.

`world-pops --villages` rode the villages of every leg at 15 and 30 m/s: none of their houses (4 059 first drawings) was first drawn in view within 250 m, so the stream was not late at 30 m/s. Before, 123 were on the Gotthard leg, 102 on leg 2 and 299 on leg 3. The far boxes stand where their whole houses stand (the same matrix); a check reads each far house as a thing of its own from the mesh's `farHouses` (its placement and its far box), as world-clearance does.

## The effects on the ladder

The effects (`js/effects.js`, rules in [rendering.md](rendering.md), "Effects") are not columns of the levels: each effect carries its own measured cost, and a level carries `effectMs`. `Game.applyEffects` puts in force, for each effect, the highest level up to the player's choice that costs no more than `effectMs` of the level in force (Auto only). So as the frame time steps the ladder down, the step to Rich gives up the effects over 0.7 ms (the high occlusion and the edge smoothing), the step to Full those over 0.4 ms (the shadow cascades and the low occlusion), and only the step from Full to High loses pixel ratio; there only the effects of 0.2 ms or less are left (land detail, reflections, grade, glare, speed blur).

A row may keep a level longer than its cost (`keep` in `Effects.LIST`, read by `Effects.keepOf`): that level counts as `keep` ms on the ladder. Only the ground texture does: its Medium (1.7 ms) counts as 0.7, because it is the most look for its time of any effect. So the ground texture goes down in three steps: the step to Rich gives up its High (the relief, 0.6 ms, hard to see) with the high occlusion and the edge smoothing; the step to Full gives up Medium for Low (1.4 ms, the largest saving there) with the shadow cascades and the low occlusion; the step from Full to High turns Low (0.3 ms) off with the pixel ratio. A step is a uniform: the land's program is the same at every level, the textures are made once in a worker as the settings are read (`Effects.prepare`), so a step never compiles or makes a texture. The ladder's own rules (two slow windows down, eight good windows up, the grace and the retry block) are the hysteresis; the ground texture adds none. `world-ground-flip` rides 2.2 km in the far chase while the dialog and the ladder flip it 480 times: no land tile is lost or left undrawn, the land always has a program, and the only frames over 50 ms are the ones that compile (the first change of the cascades).

## What the effects cost

Measured with `node tools/terrain-check.mjs world-quality --world tremola --gpu --desk --measure --rounds 3 --effects high` (and `--effects edgeBlur,ao=low` for the low occlusion) on the Mac mini (`heavy -c browser`, an Apple M-series GPU) at a 1440 x 900 view at a device pixel ratio of 2 (2880 x 1800 pixels, as the owner's screen), in the chase view at s 1319 by day, at s 7900 in the rain (`--at 7900`) and at night (`--night`). Each effect in force is turned off against the frame with every effect on (`fx-<id>`). The number is the draw's time (submit and the wait for the GPU, `savedRenderMs`); the browser's GPU timer read up to eight times as much on that machine and its sums did not add up, so it is not used. Runs drift by about 0.2 ms.

| Effect | Day | Rain | Night | In `Effects.LIST` |
|---|---|---|---|---|
| Ambient occlusion high | 0.9 | 1.1 | 0.5 | 1.1 |
| Ambient occlusion low | 0.6 (day only) | | | 0.6 |
| Edge smoothing | 0.8 | 0.7 | 0.6 | 0.8 |
| Sun shadows (cascades) | 0.6 (+0.2 submit) | 0.6 | 0.6 | 0.6, CPU 0.2 |
| Headlight glare | 0 (not drawn by day) | 0 | 0.2 | 0.2 |
| Speed blur | 0 | 0.2 | 0.1 | 0.2 |
| Colour grade | 0 | 0 | 0.2 | 0.2 |
| Land detail | 0.1 | 0 | 0 | 0.1 |
| Reflections | 0.1 | 0 | 0.1 | 0.1 |
| Ground texture low / medium / high (`world-quality --desk --measure --parts fx-groundTex` at s 1319, 1600 and 2600 by day, the most of the three; at the Balanced preset's 2160 x 1350 Medium is 0.7 to 1.0) | 0.3 / 1.7 / 2.3 | | | 0.3 / 1.7 / 2.3 (Medium kept as 0.7) |
| Ground cover (s 1600, the defaults and `groundCover`, 5 rounds, two runs: 165,000 more triangles) | 1.0 and 1.3 (GPU 0.9, 1.1) | | | 1.3 |

The whole frame with every effect on drew in 11.6 ms by day. For scale: the pixel ratio from 2 to 1.5 saved 3.4 ms, the samples 1.9 ms, the shadows 1.5 ms.

The defaults (the occlusion low, land detail, the cascades, reflections, grade, glare and speed blur on, the ground texture at Medium; edge smoothing off, since the 4 samples already smooth the edges) and the frame time (`world-frametime`, the median of five places, on the mini):

| View | Before the effects | With the defaults |
|---|---|---|
| 960 x 540 | 4.3 and 4.4 ms (worst 6.6, 5.9) | 5.0 and 5.3 ms (worst 6.9, 7.1) |
| 2880 x 1800 (`--desk`) | 14.2 and 13.7 ms (worst 20.7, 18.8) | 15.7 and 15.4 ms (worst 21.3, 17.9) |

With the ground texture at Medium (the default since it came in) the 2880 x 1800 median was 17.3 ms (worst 22.5) against 16.2 ms (worst 20.4) with it off, one run after the other on the mini. That is over the 16.7 ms budget but under the 20.8 ms that steps the ladder down, so on that machine Auto holds the top level. A slower GPU steps down to Rich and then Full, where Medium and then the textures go first.

Two pairs, each taken one after the other on the same machine. So the defaults keep the owner's size of frame inside the 16.7 ms budget on that GPU, and Auto takes the dearer ones off first where it is slower. No effect adds a triangle to the scene: `world-budget` counted 457,633 before and 457,722 with the defaults at s 2000 (the window was over 450,000 there before the effects too; a third run from another folder counted 532,892 with the game before the effects, so the count moves with the order the models load in). `tests/unit/effects.test.js` holds that no effect in force costs more than its level's share, that a step down never turns an effect on, and that the three dearest effects are off at every level under the full pixel ratio.

A desktop starts at Ultra (`Quality.START`), a phone where it did before (Low, Medium or High), so a phone has only the near-free effects until its frame time shows headroom.

The settings dialog (`js/settings.js`) sets the preset: Auto releases the ladder (`quality.release`), Low, Balanced and High fix it (`quality.fix`) at `low`, `high` and `ultra`.


## The held shot at a leg's end

At a leg's end the camera flies to the stop's hold and holds there for the card (`StopScene`, [world.md](world.md), "The stop scene at a leg's end"). A view that holds still can draw more than a ride can. `StopScene.RAISE` gives, for each level, what the held shot raises over the level in force. `Game.raiseShot` puts it in force in two parts:

- **From the scene's start:** what is built once. The land's level of detail by distance (`WorldStreamer.tileLodM` over `TILE_LOD_M`, 700 and 2 000 m), the share of trees and the near trees, the reach of the near and mid trees, and the trees' triangle cap (`Scenery.setShot`). The streamer builds it while the camera flies for 9 s, so nothing comes in after the camera holds.
- **Once the camera holds:** what each frame draws. The pixel ratio, the shadow map (4 096, never over the GPU's largest texture), the samples and the effects up to `effectMs`. A new shadow map, render target or program can cost one frame of up to 200 ms. In the fly that showed as a jump of the picture. On a still view it does not show.

The ladder holds its level through the scene (`Game.holdQuality`). `Game.dropShot` puts the level in force again at the end of the scene. A level fixed in the scene (the tuning panel, the settings dialog) keeps the raise over it (`Game.applyQuality`).

| Level | Raise from the start | Raise once it holds |
|---|---|---|
| 0 Lowest | land 1 000 / 2 500 m, trees 0.6 | none |
| 1 Low | land 1 200 / 3 000 m, trees 0.8 | none |
| 2 Medium | land 1 500 / 4 000 m, all trees, mid trees to 600 m | none |
| 3 High | land 2 000 / 5 000 m, all trees, 48 near, mid trees to 800 m, cap x 1.2 | none |
| 4 Full, 5 Rich, 6 Ultra | land 2 500 / 6 000 m, all trees, 48 near, near trees to 220 m, mid to 1 000 m, cap x 1.4 | pixel ratio 2, shadow map 4 096, 4 samples, every effect the player chose |

Each stop with a held shot has a `raise` cap in its data (tools/world/route.json, then the folder's manifest), so the held shot at Ultra stays under LEG_BUDGET (450 000) with a margin. The cap takes the lower of the level's raise and its own. Measured with `world-shot` at Ultra (2026-11-26):

| Stop | Cap: land, scenery share | Held shot |
|---|---|---|
| Hospice square (Tremola's end) | 800 / 2 000 m, 1 | 400 560, 420 702 |
| Lookout over Airolo (leg 1's end, the Gotthard leg's) | 1 200 / 3 000 m, 0.55 | 421 628, 405 426 |
| Andermatt hotel (leg 2's end) | 700 / 2 000 m, 0.85 | 377 168 |
| Airolo car park (leg 1's start, the Tremola's) | 1 000 / 2 500 m, 1 | 423 076 |
| Göschenen car park (leg 3's end) | 700 / 2 000 m, 0.85 | 420 351 |
| Susten pass (leg 4's end) | 1 000 / 2 500 m, 1 | 427 565 |
| Gadmen car park (leg 5's end) | 1 000 / 2 500 m, 1 | 410 512 |

Without a cap the held shots read up to 620 334 (Göschenen). The lookout's own land adds little: its scenery (173 000 triangles of trees and houses) is what the share cuts.

A phone or a tablet starts at Lowest to High (`Quality.START`). Those levels raise nothing that each frame pays for. With the pixel ratio 2 and the effects over High, the phone page's held frame went from 6.2 to 8.6 ms (worst 18 ms) on a computer's GPU, so a real phone would stall.

Frame time of the held shot at the Gotthard lookout, without and with the raise (`node tools/terrain-check.mjs world-shot --world gotthard-north --gpu --desk --levels` on the Mac mini, one job alone, 1440 x 900 at a device pixel ratio of 2; the median of 40 frames: the scene's step, the land's update, the draw and its wait):

| Level | Buffer | Frame ms, without / with | GPU ms, without / with | Triangles, without / with |
|---|---|---|---|---|
| 6 Ultra | 2880 x 1800 | 12.1 / 12.5 | 8.9 / 9.5 | 662 559 / 773 115 |
| 5 Rich | 2880 x 1800 | 12.1 / 12.7 | 8.9 / 9.5 | 662 559 / 773 115 |
| 4 Full | 2880 x 1800 | 14.0 / 15.3 | 8.4 / 9.5 | 242 315 / 549 575 |
| 3 High | 2160 x 1350 | 6.9 / 6.8 | 4.8 / 4.8 | 242 315 / 275 837 |
| 2 Medium | 1800 x 1125 | 3.8 / 4.0 | 2.0 / 2.4 | 240 649 / 269 103 |
| 1 Low | 1440 x 900 | 2.6 / 2.6 | 1.3 / 1.4 | 199 767 / 216 873 |
| 0 Lowest | 1080 x 675 | 2.2 / 2.8 | 0.8 / 0.7 | 187 203 / 216 855 |

- Full, Rich and Ultra raise the effects to the player's choice: at Full that turns the ground cover on (the larger count of triangles).
- The fly itself (the same run, every frame drawn): median frame 9.9 ms, the worst 28.1 ms. Before the raise was cut in two parts, frames of 160 and 205 ms came in the fly.
- The phone page (`--phone`: 390 x 844 at 3, touch, the CPU 4 times slower; a computer's GPU), with the raise as it is now at Lowest to Medium: Lowest 4.1 / 4.5 ms, Low 5.5 / 5.7 ms, Medium 6.8 / 6.5 ms, without and with.
- The pictures of each level are written next to the run (`~/Library/Caches/twisty-world/lookout-shots`, outside the repo).

## What a world frame costs

Measured with `node tools/terrain-check.mjs world-quality --world tremola --gpu --phone --measure --rounds 5` at s 1319 in the chase view. `--phone` is a 390 x 844 view at device pixel ratio 3, touch, and the CPU 4 times slower (Chrome's CPU throttle). Chrome has no GPU throttle, so the GPU was an Apple M-series. The probe turns one part off at a time against the full frame. The GPU time comes from a timer query. The numbers drift by about 0.5 ms from run to run, so read only the order.

| Part off | GPU ms saved (of about 4.8) | CPU ms saved (draw submit, of about 4.8) | Look lost |
|---|---|---|---|
| Pixel ratio 2 to 1.5 / 1 / 0.75 | 1.0 / 1.8 / 2.3 | 0.2 / 0.2 / 0.8 | soft edges, then blocks |
| MSAA 4 to 0 | 0.9 to 1.9 | 0 | jagged edges |
| Houses | 1.6 | 0.1 | the villages (not in the ladder: `js/world/scenery.js`) |
| Trees | 1.0 | 0.1 | the near forest |
| Bloom | 0 to 1.1 | 0 | the glare round the sun and bright paint |
| Far land | 0.6 | 0 | the mountains (not in the ladder) |
| Haze | 0.5 | 0 | the blue of distant land (not in the ladder: `world-haze` holds it) |
| Shadows | 0.3 | 0.5 to 0.7 | the bike's and the cars' shadows |
| Shadow map 2048 to 1024 | 0.3 | 0.5 | softer shadow edges |

The full frame was about 12 ms: update 1 ms, draw submit 4.8 ms, GPU 4.8 ms. The CPU draw submit is as large as the GPU time. It falls with the draw calls (about 620 with traffic in view, about 85 of them the shadow pass). The ladder thus drops the shadows at level 1.

The order of the ladder is the cost saved for the look lost: first the pixel ratio (the largest saving, and a phone screen hides it), then the samples and the shadow map, then the shadows and the far trees, then the bloom.

Frame time at each level, same place and page (`world-quality --phone`, no `--measure`):

| Level | Drawing buffer | GPU ms | Frame ms |
|---|---|---|---|
| 4 Full | 780 x 1688 | 4.6 | 12.7 |
| 3 High | 585 x 1266 | 2.6 | 10.0 |
| 2 Medium | 487 x 1055 | 2.7 | 10.6 |
| 1 Low | 390 x 844 | 2.5 | 8.2 |
| 0 Lowest | 292 x 633 | 1.7 | 7.7 |

`--out <dir>` saves a picture of each level at that place.

## How the frame time steps the ladder

`Game.adaptResolution(now)` runs at the top of every frame. It gives the ladder two times:

- the frame time: the time since the last frame. This is what the rider sees.
- the work: the time from the start of the last frame to the end of its draw (`Graphics.renderedAt`). A screen at its refresh rate hides the frame time below the refresh. The work shows if there is headroom.

`QualityLadder.sample` reads the frames in windows of 1 s (`Quality.RULES.windowMs`), by the median frame:

- **Down**: the median is over 20.8 ms (48 fps) in 2 windows in sequence. The ladder goes one level down.
- **Up**: the median is at the budget (16.7 ms, plus 10%) and the median work is under 60% of the budget, in 8 windows in sequence. The ladder goes one level up. Up is slow and down is quick, because a dropped frame costs more than a sharper frame gains.
- **Hold**: a median between the two holds the level.
- **Grace**: the ladder reads nothing for 3 s after a level change. It reads nothing for 2 s after a frame over 100 ms, after a frame in which the streamer built for more than 6 ms (`streamer.stats.frameBuildMs`), after a pause, and in the first 4 s of a ride (`adaptGraceUntil`). Thus a tile-load spike or a shader compile never counts as a slow window.
- **Retry**: a level that fails within 10 s of a step up to it is blocked for 60 s. Each failure doubles the block, to a maximum of 8 min. Thus a level that is just too slow is not tried again and again.

The rules are data in `Quality.RULES`.

## The start level

`Quality.startLevel(Quality.device(window))` reads the first row of `Quality.START` that agrees with the device:

| Touch | Short screen side | Logical CPUs | Memory | Level |
|---|---|---|---|---|
| yes | 500 px or less | 4 or fewer | | Low |
| yes | 500 px or less | | | Medium |
| yes | | | | High |
| | | 2 or fewer | | Medium |
| | | | 2 GB or less | Medium |
| | | | | Full |

A phone thus never starts at the top. It goes up only when the frame time shows headroom. A browser that does not give the CPU count counts as few CPUs.

## Fix a level, or let the frame time choose

The ladder is one object, `game.quality`:

- `quality.fix(level)` holds a level (an index or an id). The frame time does not move it.
- `quality.release()` gives the level back to the frame time ("Auto"). It starts from the level that was fixed.
- `quality.level` is the level in force. `quality.isFixed` tells if a caller fixed it.

In debug mode (`?debug`), the HUD shows the level (`Q3 High (auto)`). The tuning panel (T) has a Graphics row: − and + step through Auto and each level. A fixed level is not a tuning. The ride keeps its time. The settings dialog's presets use `fix` and `release` in the same way.

## No two materials fight in the depth buffer

Two faces of different materials that lie in one plane, one over the other, fight in the depth buffer: the frame shows one, then the other, as the camera moves. The digger's grille lay in the face of its body (0 mm apart) and flickered into the yellow from the far chase (the owner, 2026-11-27). A part laid on another part (a grille, a pane, a strip, a door, a lamp) must do one of these:

- **Stand off its face** by more than the depth buffer can part at the distance the game shows it. The camera has a near plane of 0.25 m and a 24 bit depth buffer, so one step of depth is d² / (0.25 × 2²⁴) at d metres: 0.9 mm at 60 m, 5.4 mm at 150 m. The rule needs 3 steps (`DEPTH_STEPS`) at the farthest distance where the overlap is still 4 pixels across (`SIDE_PX`), or at the distance the model is drawn to, whichever is nearer. The check prints the stand-off each place needs (`need`).
- **Be cut into its face.** Leave the face out where the part goes (`Roadworks.wall` cuts a door or a window out of a box's side, and `Roadworks.pane` sets the pane into the hole with its reveals). Then no face lies under the part.
- **Sink its back into the body.** A box whose back is inside the body and whose front stands proud has no face in the body's plane.

`polygonOffset` is the last choice: a model file cannot carry it, and it moves the shadow too.

`tools/model-stats.mjs` holds the check (`coplanar`): it finds faces of two looks (colour, texture, emission) with parallel normals (3°), less than `MAX_GAP` (5 cm) apart and over each other by more than 1 mm², and keeps a place only when a point of the overlap can see out of the model (faces back to back count only when both are double sided; a model that stands on the ground is not seen from under it). `node tools/model-stats.mjs --model <file.glb> [--draw <m>]` prints it for each level. `tests/unit/model-coplanar.test.js` runs it over every `assets/**/*.glb` at each level and over the roadworks' procedural props, each at the distance the game draws it (`DRAW`). Its `KNOWN` table holds the places that fight today, and the table may only shrink. On 2026-11-27 it found 115 places in 39 levels: the detailed bikes (1 to 7 a level, mostly a dark metal over a steel at 0 mm), the five procedural bikes, the hatchback's vent, the tunnel portal (19 places in `portal_arch`, one of them 32 m² of dressed stone over masonry at 0 mm) and the hill ride's bicycle and cart. The roadworks' props are at 0.

## No straight seam in the land's colour

The land of a tile has a colour at each 8 m node (`TerrainMesh.colours`). A change of colour that runs along a straight line reads as a seam, not as nature. On leg 1 at km 4.3 the owner saw one from the far chase: a straight line 500 m long up the hillside, dark green forest on one side and dry grass on the other (2026-11-28). It was the edge between two tiles. Each tile coloured the nodes on their shared edge from its own cover cells, so the colour changed there with no width at all. Inside a tile, each node took the class of its own 16 m cover cell, so a change of cover was a step along the cells' north-south and east-west edges.

The rules now:

- **The cover is a blend.** A cover cell stands for the node on its north-west corner (`tools/world/landcover.mjs`). A node takes a smooth blend of the cells round it, a cubic B-spline over the 16 m cells (`TerrainMesh.coverWeights`), so a change of cover spreads over about 32 m. The blend is read at a place that noise moves by up to 8 m (`COVER_WARP_M`, `COVER_WARP_SCALE_M`), so its edge does not run along a straight line. Each cover is weathered alone (rock on a steep slope, snow), then the colours mix by their weights.
- **A tile reads the tiles beside it.** The cells, zones and heights past a tile's edge come from the tile beside it (`TerrainMesh.around`, through `tile.world`, the data the tile came from). Two tiles thus colour the nodes they share alike. A tile coloured while a tile beside it was not held is coloured again when its mesh is next built (the cache keeps the tiles and covers it read).
- **The slope that makes rock is read over 5 nodes** (1 4 6 4 1 each way). Read node by node, a crease in the land (a bank laid back from a road under a steeper slope) turned grass to rock inside one 8 m cell, along the crease.
- **Rock and scree meet over a band** of their noise (`LandShade.weather` with `soft`). The far land keeps the split at 0.5 that its haze was matched with.
- **A bench weathers into the land it meets.** A bench node one node from the land takes half of the land's own colour, two nodes from it a quarter (`BENCH_WEATHER`). The road's own nodes, walls, drops and water keep their crisp edges. Water is not blended: a node shows water where its own cell is water, as before.
- The odd nodes (between the 16 m nodes) take the mean of their corners, unless a corner took a blend of covers. Then they are coloured themselves, so the blend's wander shows at 8 m.

The shading normals are not changed. The geometry and the physics are not changed.

`tests/unit/world-land-seams.test.js` holds it. It colours every tile drawn at full detail on every stage (within `WorldStreamer.TILE_LOD_M[0]` of the ride), with the tiles round it held. A step is two nodes side by side, or one node as the two tiles that share it colour it, whose sRGB colours differ by more than 32 (of 255), where that cell holds 0.45 or more of the change across it and the cell each side. A line is a run of steps across one grid line, 32 m long or more. Its `KNOWN` table holds the counts that fail today and may only shrink. Before the change: gotthard-north 1598, tremola 922, airolo-lookout 990, lookout-andermatt 1611, andermatt-goeschenen 560, goeschenen-susten 5638, susten-gadmen 2335, gadmen-innertkirchen 3187, innertkirchen-guttannen 3453, guttannen-grimsel 872, with lines on tile edges in every stage (the owner's: airolo-lookout (0, 10968), 56 m, a step of 123). After: 58, 81, 111, 56, 50, 495, 218, 445, 510, 59, none on a tile edge. What is left is the rock of a steep bank over the grass under it, and narrow features of the cover (a strip of grass 16 m wide between two woods), where a blend wide enough to soften the step would wash the feature out.

The cost: a tile's colours take about 2 ms (6.5 ms at most) against 0.5 ms before, once for each tile and the tiles beside it (Tremola, the mini). The frame time on the Tremola does not change (`world-frametime`: median 12.1 ms before, 11.3 ms after; the shader is the same).

## The dams

A dam (`js/world/dams.js`; `.agent/system/world.md`, "Dams") is one `THREE.LOD` in the structures' material: one draw call at either level. On the Grimsel stage, the seven dams are 19 878 triangles near and 2 276 far, all built at load. `world-budget` passes on `guttannen-grimsel`.

## What was not checked

- No real phone was used. The CPU throttle makes the CPU slower, but the GPU was a computer's GPU. A phone GPU is slower and pays more for each pixel, the samples and the shadow map. Thus the measured order of the pixel ratio, the samples and the shadow map is a lower bound of their real cost.
- A screen in low-power mode (30 Hz) gives a frame time of 33 ms. The ladder then steps down to the lowest level, because it cannot tell that from a slow GPU.
