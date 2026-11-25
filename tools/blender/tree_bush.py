# The roadside bushes: two shapes, and the same two with snow on them. The
# game seats a bush as it seated the faceted ball it replaces: centred on its
# origin, about a metre in radius, sunk a quarter of that into the ground.
# A bush is three leaf clumps standing apart and a fringe of leaves out over
# them (tree_shrub.py's sprays), so its outline is broken: one melted mass of
# the same faces read as a green stone.
#   blender --background --factory-startup --python tools/blender/tree_bush.py
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import math  # noqa: E402
import common  # noqa: E402
from mathutils import Vector  # noqa: E402
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


# The fringe: sprays of leaves out over the clumps (tree_shrub.spray), BUSH_SPRAYS of BUSH_LEAVES leaves each
BUSH_SPRAYS = 2
LEAF = {"leaves": 5, "fan": 2.4, "leaf": (0.5, 0.66), "narrow": 0.5}


def spray(plant, root, way, colour, centre):
    """Leaves fanned from `root` toward `way`, each two faces folded on its midrib, facing away from `centre`."""
    rand = plant.rand
    d = Vector(way).normalized()
    side = d.cross(Vector((0.0, 1.0, 0.0)))
    side = side.normalized() if side.length > 1e-3 else Vector((1.0, 0.0, 0.0))
    lift = side.cross(d).normalized()
    n = LEAF["leaves"]
    for i in range(n):
        turn = (i / (n - 1) - 0.5) * LEAF["fan"] + 0.2 * (rand.random() - 0.5)
        along = (d * math.cos(turn) + side * math.sin(turn) + lift * 0.3 * (rand.random() - 0.5)).normalized()
        length = LEAF["leaf"][0] + (LEAF["leaf"][1] - LEAF["leaf"][0]) * rand.random()
        base = Vector(root)
        tip = base + along * length
        across = along.cross(lift).normalized()
        face = across.cross(along).normalized()
        mid = base + along * length * 0.45 - face * length * LEAF["narrow"] * 0.18
        points = [tuple(base), tuple(mid + across * length * LEAF["narrow"] * 0.5), tuple(tip), tuple(mid - across * length * LEAF["narrow"] * 0.5)]
        faces = []
        for a, b, c in ((0, 1, 2), (0, 2, 3)):
            pa, pb, pc = (Vector(points[j]) for j in (a, b, c))
            faces.append((a, b, c) if (pb - pa).cross(pc - pa).dot((pa + pb + pc) / 3 - Vector(centre)) >= 0 else (a, c, b))
        normal = tuple(face if face.dot(tip - Vector(centre)) >= 0 else -face)
        plant.add(points, faces, [colour(p, normal) for p in points])


def build():
    scene = common.reset(47)
    plants = []
    for snowy in (False, True):
        for n, (name, lobes) in enumerate(SHAPES.items()):
            plant = Plant(name + ("_snow" if snowy else ""), 471 + n)
            colour = leaves(snowy)
            # The two largest lobes and the highest of the rest, so the bush keeps its height
            big = sorted(lobes, key=lambda lobe: -lobe[3])[:2]
            big.append(max((lobe for lobe in lobes if lobe not in big), key=lambda lobe: lobe[1] + lobe[3] * lobe[4]))
            for x, y, z, r, squash in big:
                plant.clump((x, y, z), r * 1.12, colour, squash=squash, rough=0.32, stretch=0.25)
            # The fringe over the two largest clumps, out toward the open side and up
            for x, y, z, r, squash in big[:BUSH_SPRAYS]:
                out = Vector((x, 0.0, z))
                out = out.normalized() if out.length > 1e-3 else Vector((1.0, 0.0, 0.0))
                root = Vector((x, y, z)) + out * r * 0.7 + Vector((0.0, r * squash * 0.45, 0.0))
                spray(plant, tuple(root), tuple(out + Vector((0.0, 0.5, 0.0))), colour, (x, y, z))
            plants.append(plant)
    finish(scene, plants, OUT, BUSH_BUDGET)


build()
