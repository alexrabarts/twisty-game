# The conifers of the forest legs: a spruce, a slim fir and a pine, and the
# same three under snow for the winter leg. Each is a trunk and a stack of
# boughs: a bough is a skirt whose rim runs out to tips and back into notches,
# so the outline is branches and not a turned cone. They are the `mid` level of
# the species in tree_species.py; a world draws the same shapes past its near
# trees (tree_alpine.py).
#   blender --background --factory-startup --python tools/blender/tree_conifer.py
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
from tree_kit import TREE_BUDGET, finish  # noqa: E402
from tree_species import conifer, pine  # noqa: E402

OUT = os.path.join(common.ASSETS, "trees", "conifer.glb")


def build():
    scene = common.reset(41)
    plants = [
        conifer("conifer_spruce", 411, "spruce", "mid"),
        conifer("conifer_fir", 412, "fir", "mid"),
        pine("conifer_pine", 413, "mid"),
        conifer("conifer_spruce_snow", 411, "spruce", "mid", snowy=True),
        conifer("conifer_fir_snow", 412, "fir", "mid", snowy=True),
        pine("conifer_pine_snow", 413, "mid", snowy=True),
    ]
    finish(scene, plants, OUT, TREE_BUDGET)


build()
