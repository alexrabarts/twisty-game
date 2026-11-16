# The roadside bushes: two shapes, and the same two with snow on them. The
# game seats a bush as it seated the faceted ball it replaces: centred on its
# origin, about a metre in radius, sunk a quarter of that into the ground.
#   blender --background --factory-startup --python tools/blender/tree_bush.py
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
from tree_kit import BUSH_BUDGET, Plant, finish, mix, patches, srgb  # noqa: E402

OUT = os.path.join(common.ASSETS, "trees", "bush.glb")

# The lighter of the game's two bush greens; the game tints the darker one down
GREENS = (srgb(0x2B4A1E), srgb(0x6A9A38), srgb(0x93A83E))
SNOW = (srgb(0xC4D2E2), srgb(0xF4F7FB))
SHAPES = {
    "bush_round": [(0.0, 0.1, 0.0, 0.8, 0.85), (0.5, 0.0, 0.3, 0.55, 0.8), (-0.45, -0.05, -0.35, 0.55, 0.8), (0.1, 0.5, -0.1, 0.5, 0.8)],
    "bush_low": [(0.3, -0.05, 0.0, 0.62, 0.7), (-0.4, -0.1, 0.25, 0.58, 0.7), (0.0, -0.1, -0.5, 0.5, 0.7), (-0.15, 0.3, -0.05, 0.45, 0.7), (0.65, -0.15, -0.4, 0.38, 0.7)],
}


def leaves(snowy):
    shade, light, cast = GREENS

    def colour(point, normal):
        t = max(0.0, min(1.0, 0.5 * (point[1] + 0.5) / 1.4 + 0.5 * (normal[1] * 0.5 + 0.5)))
        green = mix(mix(shade, light, t), cast, max(0.0, patches(point, 1.3)) * 0.7 * t)
        if not snowy:
            return green
        # Snow lies where the bush looks up
        lying = max(0.0, min(1.0, (normal[1] - 0.25) / 0.4))
        return mix(green, mix(SNOW[0], SNOW[1], t), lying)
    return colour


def build():
    scene = common.reset(47)
    plants = []
    for snowy in (False, True):
        for n, (name, lobes) in enumerate(SHAPES.items()):
            plant = Plant(name + ("_snow" if snowy else ""), 471 + n)
            plant.crown(lobes, 64, leaves(snowy), rough=0.3, voxel=0.09, grain=0.6)
            plants.append(plant)
    finish(scene, plants, OUT, BUSH_BUDGET)


build()
