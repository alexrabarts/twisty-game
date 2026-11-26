# The trees of a world (js/world/scenery.js): the species of the Gotthard's slopes, each at three levels of detail
# (tree_species.py). A world draws the near level for the trees nearest the rider, the mid level past them and the
# far level for the rest, and moves a tree from one to the next as the rider rides on.
#   blender --background --factory-startup --python tools/blender/tree_alpine.py
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
from tree_kit import finish  # noqa: E402
from tree_species import BUDGETS, broadleaf, conifer, pine  # noqa: E402

OUT = os.path.join(common.ASSETS, "trees", "alpine.glb")

# Each species, its seed and how it is made; the node of a level is `<species>_<level>`
SPECIES = {
    "spruce": (411, lambda name, seed, lod: conifer(name, seed, "spruce", lod)),
    "fir": (412, lambda name, seed, lod: conifer(name, seed, "fir", lod)),
    "pine": (413, lambda name, seed, lod: pine(name, seed, lod)),
    "larch": (414, lambda name, seed, lod: conifer(name, seed, "larch", lod)),
    "beech": (432, lambda name, seed, lod: broadleaf(name, seed, "beech", lod)),
    "ash": (433, lambda name, seed, lod: broadleaf(name, seed, "ash", lod)),
}


def build():
    scene = common.reset(45)
    plants = [make(f"{species}_{lod}", seed, lod) for species, (seed, make) in SPECIES.items() for lod in ("near", "mid", "far")]
    finish(scene, plants, OUT, lambda plant: BUDGETS[plant.name.rsplit("_", 1)[1]])


build()
