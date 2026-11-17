# The Gotthard Hospiz landmark, the one node `landmark_hospiz` of assets/village/hospiz.glb: the long hospice of
# rubble stone, three storeys under a pitched slate roof with its eaves to the road, and the old customs house
# beside it, plastered on a stone plinth under a gable. Generic buildings in the village houses' kit and style
# (every stone and tile a face of its own shade, occlusion baked into the vertex colours): no signage, no lettering.
# The node's origin is the middle of the pair's footprint at ground level, x along the road, -z the road side.
#
#   blender --background --factory-startup --python tools/blender/landmark_hospiz.py
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common
import village_houses as vh
from village_kit import Shape, finish
from mathutils import Vector

SEED = 5131
BUDGET = 24000
HOSPICE_W, HOSPICE_D = 27.0, 13.0
CUSTOMS_W, CUSTOMS_D = 10.0, 8.0
# The customs house stands this far past the hospice's end, set back a little from its front
CUSTOMS_GAP, CUSTOMS_BACK = 6.0, 1.5


def hospice():
    vh.DEPTH = HOSPICE_D
    w = HOSPICE_W
    sh, frames, levels, top = vh.shell("hospice", SEED + 1, w, 0.6, [(3.3, "stone"), (3.0, "stone"), (3.0, "stone")], 27, "x", vh.SLATE, eaves=0.7, verge=0.5, gable="plaster", tile=(0.6, 0.46))
    f = frames["front"]
    vh.door(sh, f, w / 2, w=1.6, h=2.6, y=0.16, boards=7)
    bays = [2.0 + (w - 4.0) * n / 9 for n in range(10)]
    for s in bays:
        if abs(s - w / 2) > 1.6:
            vh.window(sh, f, s, levels[0] + 1.0, w=1.0, h=1.45, frame=vh.STONE_LIGHT)
        for k in (1, 2):
            vh.window(sh, f, s, levels[k] + 0.85, w=1.0, h=1.4, frame=vh.STONE_LIGHT)
    back = frames["back"]
    for s in bays[1::2]:
        for k in (0, 1, 2):
            vh.window(sh, back, s, levels[k] + 0.95, w=0.95, h=1.3, shutters=False, frame=vh.STONE_LIGHT)
    for side in ("left", "right"):
        for s in (3.2, HOSPICE_D - 3.2):
            for k in (0, 1, 2):
                vh.window(sh, frames[side], s, levels[k] + 0.95, w=0.95, h=1.35, frame=vh.STONE_LIGHT)
        vh.window(sh, frames[side], HOSPICE_D / 2, levels[3] + 0.6, w=0.8, h=1.0, shutters=False, frame=vh.STONE_LIGHT)
    # A string course of dressed stone under each upper storey
    for k in (1, 2):
        for side, L in (("front", w), ("back", w), ("left", HOSPICE_D), ("right", HOSPICE_D)):
            sh.fbox(frames[side], (-0.03, L + 0.03), (levels[k] - 0.1, levels[k] + 0.06), (0.0, 0.08), vh.STONE_LIGHT, skip=("back",))
    for x in (-w / 2 + 4.0, w / 2 - 4.0):
        vh.chimney(sh, x, HOSPICE_D / 2 + 1.2, levels[3] + 1.4, top + 0.6)
    return sh


def customs():
    vh.DEPTH = CUSTOMS_D
    w = CUSTOMS_W
    sh, frames, levels, top = vh.shell("customs", SEED + 2, w, 0.7, [(3.0, "plaster"), (2.8, "plaster")], 34, "z", vh.SLATE, eaves=0.6, verge=0.6, gable="plaster", tile=(0.6, 0.46))
    f = frames["front"]
    vh.door(sh, f, w / 2, w=1.3, h=2.3, y=0.18)
    for s in (2.0, w - 2.0):
        vh.window(sh, f, s, levels[0] + 1.0)
    for s in (2.0, w / 2, w - 2.0):
        vh.window(sh, f, s, levels[1] + 0.9)
    vh.window(sh, f, w / 2, levels[2] + 1.2, w=0.8, h=0.9, shutters=False)
    for side in ("left", "right"):
        for s in (2.2, CUSTOMS_D - 2.2):
            vh.window(sh, frames[side], s, levels[0] + 1.0)
            vh.window(sh, frames[side], s, levels[1] + 0.9)
    vh.chimney(sh, 2.0, CUSTOMS_D / 2, levels[2] + 1.6, top + 0.5, w=0.6)
    return sh


def place(dst, src, dx, dz):
    """The faces of `src` moved by (dx, 0, dz) into `dst`."""
    base = len(dst.verts)
    dst.verts += [Vector((v.x + dx, v.y, v.z + dz)) for v in src.verts]
    dst.colours += src.colours
    dst.faces += [tuple(i + base for i in face) for face in src.faces]
    dst.tags += src.tags
    dst.windows += src.windows


def main():
    common.reset(SEED)
    a, b = hospice(), customs()
    # The pair centred on the origin in plan: the hospice from -W/2, the customs house past its right end
    x0, x1 = -HOSPICE_W / 2, HOSPICE_W / 2 + CUSTOMS_GAP + CUSTOMS_W
    mid = (x0 + x1) / 2
    depth = max(HOSPICE_D, CUSTOMS_BACK + CUSTOMS_D)
    pair = Shape("landmark_hospiz", SEED)
    place(pair, a, -mid, -depth / 2)
    place(pair, b, HOSPICE_W / 2 + CUSTOMS_GAP + CUSTOMS_W / 2 - mid, CUSTOMS_BACK - depth / 2)
    if pair.windows > 255:
        raise SystemExit(f"{pair.name}: {pair.windows} windows do not fit a byte")
    finish(os.path.join(common.ASSETS, "village", "hospiz.glb"), [pair], SEED, BUDGET)
    print(f"landmark_hospiz footprint: {x1 - x0:.1f} m along, {depth:.1f} m deep")


main()
