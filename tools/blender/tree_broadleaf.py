# The broadleaf trees of the forest legs: a round oak, a tall beech and a
# spreading ash with two crowns. Each is a trunk with a limb or two under a
# crown of leaf clumps, one to each lobe of the species' layout, so the outline
# is broken and the sky shows between them. They are the `mid` level of the
# species in tree_species.py; a world draws the same shapes past its near trees
# (tree_alpine.py).
#   blender --background --factory-startup --python tools/blender/tree_broadleaf.py
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
from tree_kit import TREE_BUDGET, finish  # noqa: E402
from tree_species import broadleaf  # noqa: E402

OUT = os.path.join(common.ASSETS, "trees", "broadleaf.glb")


def build():
    scene = common.reset(43)
    finish(scene, [broadleaf("broadleaf_oak", 431, "oak", "mid"), broadleaf("broadleaf_beech", 432, "beech", "mid"), broadleaf("broadleaf_ash", 433, "ash", "mid")], OUT, TREE_BUDGET)


build()
