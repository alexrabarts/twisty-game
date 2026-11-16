# The broadleaf trees of the forest legs: a round oak, a tall beech and a
# spreading ash with two crowns. Each is a trunk with a limb or two under a
# leafy mass: lobes melted into one skin, so every triangle is on the outside.
#   blender --background --factory-startup --python tools/blender/tree_broadleaf.py
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
from tree_kit import TREE_BUDGET, Plant, finish, mix, patches, srgb  # noqa: E402

OUT = os.path.join(common.ASSETS, "trees", "broadleaf.glb")

BARK = (srgb(0x3A2B1C), srgb(0x6A4C33))
PALE_BARK = (srgb(0x4C4438), srgb(0x8C8474))
# Leaves: the shaded underside, the crown in the light, and the cast a patch may take
GREENS = {
    "oak": (srgb(0x21401F), srgb(0x6E953F), srgb(0x8A9B3C)),
    "beech": (srgb(0x1F4424), srgb(0x5C8F45), srgb(0x7FA048)),
    "ash": (srgb(0x27451F), srgb(0x79A046), srgb(0x9AA544)),
}


def leaves(greens, low, high):
    """A crown's colour by height and by how far a face looks up, with slow patches of another cast."""
    shade, light, cast = greens

    def colour(point, normal):
        lift = (point[1] - low) / (high - low)
        t = max(0.0, min(1.0, 0.55 * lift + 0.45 * (normal[1] * 0.5 + 0.5)))
        return mix(mix(shade, light, t ** 1.15), cast, max(0.0, patches(point, 0.4)) * 0.8 * t)
    return colour


def oak(name, seed):
    plant = Plant(name, seed)
    plant.trunk([(0, 0, 0, 0.52), (0.02, 1.3, 0, 0.38), (0.1, 2.9, 0.05, 0.31), (0.15, 4.3, 0.05, 0.22)], 6, *BARK)
    plant.trunk([(0.08, 2.5, 0.03, 0.2), (1.3, 3.8, 0.45, 0.1)], 4, *BARK)
    plant.trunk([(0.08, 2.7, 0.03, 0.18), (-1.15, 3.9, -0.5, 0.09)], 4, *BARK)
    lobes = [(0.0, 5.4, 0.0, 1.9, 0.85), (1.75, 4.5, 0.6, 1.45, 0.8), (-1.6, 4.6, -0.8, 1.45, 0.8), (0.4, 6.7, -0.4, 1.35, 0.8), (-0.5, 4.8, 1.7, 1.25, 0.8), (0.6, 4.5, -1.8, 1.15, 0.8), (-1.1, 6.2, 0.6, 1.0, 0.8)]
    plant.crown(lobes, 166, leaves(GREENS["oak"], 3.4, 7.9), rough=0.5, grain=1.2)
    return plant


def beech(name, seed):
    plant = Plant(name, seed)
    plant.trunk([(0, 0, 0, 0.44), (0, 1.3, 0, 0.32), (-0.05, 3.0, 0.05, 0.25), (0.0, 4.4, 0.0, 0.16)], 6, *PALE_BARK)
    plant.trunk([(-0.03, 2.6, 0.03, 0.14), (0.9, 3.6, -0.35, 0.07)], 4, *PALE_BARK)
    lobes = [(0.0, 4.4, 0.0, 1.4, 1.0), (0.5, 5.9, 0.2, 1.45, 1.0), (-0.45, 7.2, 0.1, 1.3, 1.05), (0.15, 8.5, -0.1, 0.95, 1.1), (1.15, 4.5, -0.6, 0.95, 0.85), (-1.05, 5.4, 0.7, 0.95, 0.9), (0.2, 6.6, -1.0, 0.85, 0.9)]
    plant.crown(lobes, 172, leaves(GREENS["beech"], 3.0, 9.5), rough=0.45, grain=1.1)
    return plant


def ash(name, seed):
    plant = Plant(name, seed)
    plant.trunk([(0, 0, 0, 0.47), (-0.02, 1.3, 0, 0.35), (-0.1, 2.5, 0.0, 0.3)], 6, *BARK)
    # The fork shows between the two crowns
    plant.trunk([(-0.1, 2.4, 0.0, 0.24), (-1.0, 3.5, 0.15, 0.17), (-1.6, 4.6, 0.2, 0.1)], 5, *BARK)
    plant.trunk([(-0.1, 2.4, 0.0, 0.26), (0.7, 3.8, -0.1, 0.19), (1.4, 5.5, -0.2, 0.1)], 5, *BARK)
    left = [(-1.7, 4.9, 0.2, 1.5, 0.75), (-2.4, 4.4, -0.7, 1.0, 0.75), (-1.2, 4.6, 1.3, 1.0, 0.75)]
    right = [(1.5, 6.0, -0.2, 1.6, 0.78), (2.3, 5.4, 0.8, 1.05, 0.75), (0.6, 7.0, 0.4, 1.1, 0.8), (1.3, 5.5, -1.5, 0.95, 0.75)]
    plant.crown(left, 62, leaves(GREENS["ash"], 3.6, 6.2), rough=0.45, grain=1.1)
    plant.crown(right, 92, leaves(GREENS["ash"], 4.6, 8.0), rough=0.45, grain=1.1)
    return plant


def build():
    scene = common.reset(43)
    finish(scene, [oak("broadleaf_oak", 431), beech("broadleaf_beech", 432), ash("broadleaf_ash", 433)], OUT, TREE_BUDGET)


build()
