# The shrubs of a world (js/world/scenery.js, Scenery.SHRUBS): the bushes of the Gotthard's slopes (one species: each
# is an instanced mesh at each level, and the window's meshes have little margin), each at three
# levels of detail, as the trees are (tree_species.py, tree_alpine.py):
#   near   stems out of the ground to every mass of leaves, and each mass a cluster of leaf clumps with sky between
#          them, so the outline is broken and a stem shows under the leaves
#   mid    one clump to a mass on two stems: the same outline, a tenth of the faces
#   far    one clump over the whole shrub
# Every level of a species is made from one layout (its masses: where each stands and how big it is), so the outline
# holds when the game swaps one level for the next.
#
# The game stands a world's bush with its origin 0.2 m under the ground at any scale (0.8 to 1.4), so a model's ground
# is y = 0.2: the stems start at y = 0, in the ground, and the lowest leaves sit on it. The world draws the colours in
# its own palette (js/world/vegetation.js, a species' `palette`), keeping each vertex's shading: a stem is a vertex
# whose green does not lead, and takes the palette's wood.
#   blender --background --factory-startup --python tools/blender/tree_shrub.py
import math
import random
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
from mathutils import Vector  # noqa: E402
from tree_kit import Plant, finish, mix, patches, srgb  # noqa: E402

OUT = os.path.join(common.ASSETS, "trees", "shrubs.glb")
BUDGETS = {"near": 800, "mid": 140, "far": 24}
GROUND = 0.2

BARK = (srgb(0x3A2C20), srgb(0x6B5440))
# Leaves: the shaded inside, the tips in the light, and the cast a patch may take
GREENS = {
    # Alpine rose: small dark glossy leaves in a dense dome
    "rose": (srgb(0x16301A), srgb(0x3E6A38), srgb(0x6A7A34)),
}
# A species as a layout: its height and reach, its masses of leaves (count, radius range, how flat) and its stems. A
# mass's outside is clothed in sprays of leaves, `sprays` for each square metre of its radius, each spray `leaves`
# leaves fanned over `fan` radians; a leaf is `leaf` long and `narrow` of that wide
SHRUBS = {
    "rose": {"height": 0.8, "reach": 0.8, "masses": 5, "radius": (0.3, 0.42), "squash": 0.7, "stems": 8, "sprays": 92, "leaves": 4, "fan": 2.0, "leaf": (0.17, 0.23), "narrow": 0.5, "out": 0.45},
}
SEEDS = {"rose": 612}


def leaves(greens, low, high):
    """A shrub's leaf colour by height and by how far a point looks up, with slow patches of another cast."""
    shade, light, cast = greens

    def colour(point, normal):
        lift = (point[1] - low) / max(1e-6, high - low)
        t = max(0.0, min(1.0, 0.5 * lift + 0.5 * (normal[1] * 0.5 + 0.5)))
        return mix(mix(shade, light, t ** 1.1), cast, max(0.0, patches(point, 1.1)) * 0.75 * t)
    return colour


def layout(species):
    """The masses of a species: [(x, y, z, radius, squash)], drawn from its seed, and the stems' feet."""
    spec = SHRUBS[species]
    rand = random.Random(SEEDS[species])
    masses = []
    phase = rand.random() * 2 * math.pi
    for k in range(spec["masses"]):
        r = spec["radius"][0] + (spec["radius"][1] - spec["radius"][0]) * rand.random()
        squash = spec["squash"] * (0.9 + 0.2 * rand.random())
        # The first mass is the middle and the top; the others stand round it, lower toward the rim
        if k == 0:
            out, angle = 0.15 * spec["reach"] * rand.random(), phase
            y = spec["height"] - r * squash
        else:
            angle = phase + (k + 0.3 * (rand.random() - 0.5)) * 2 * math.pi / (spec["masses"] - 1)
            out = (spec["reach"] - r) * (0.75 + 0.25 * rand.random())
            top = spec["height"] * (0.55 + 0.35 * rand.random())
            y = max(GROUND + r * squash * 0.8, top - r * squash)
        masses.append((out * math.cos(angle), y, out * math.sin(angle), r, squash))
    feet = [(0.12 * (rand.random() - 0.5), 0.12 * (rand.random() - 0.5)) for _ in range(spec["stems"])]
    return masses, feet


def stem(plant, foot, tip, r0, r1, sides, bend=0.15, straight=False):
    """A stem from a foot in the ground to `tip`, bowed out a little on its way (`straight`: one length, for the mid level)."""
    x0, z0 = foot
    x1, y1, z1 = tip
    if straight:
        plant.trunk([(x0, 0.0, z0, r0), (x1, y1, z1, r1)], sides, *BARK)
        return
    mx, my, mz = (x0 + x1) / 2, y1 * 0.5 + GROUND * 0.5, (z0 + z1) / 2
    out = math.hypot(mx, mz) or 1.0
    mx += mx / out * bend
    mz += mz / out * bend
    plant.trunk([(x0, 0.0, z0, r0), (mx, my, mz, (r0 + r1) / 2), (x1, y1, z1, r1)], sides, *BARK)


def shrub(name, species, lod):
    spec = SHRUBS[species]
    plant = Plant(name, SEEDS[species] + {"near": 0, "mid": 1, "far": 2}[lod] * 1000)
    rand = plant.rand
    masses, feet = layout(species)
    greens = GREENS[species]
    low = GROUND
    high = max(y + r * s for _, y, _, r, s in masses)
    colour = leaves(greens, low, high)

    if lod == "far":
        # One clump over the whole shrub: as wide as its reach, as high as its top
        cx = sum(m[0] for m in masses) / len(masses)
        cz = sum(m[2] for m in masses) / len(masses)
        half = (high - GROUND * 0.5) / 2
        plant.clump((cx * 0.5, GROUND * 0.5 + half, cz * 0.5), spec["reach"] * 1.02, colour, squash=(half + 0.12) / spec["reach"], rough=0.18, stretch=0.1)
        return plant

    if lod == "mid":
        # Two stems that show under the leaves, and a clump to each mass
        for k, (x, y, z, r, s) in enumerate(sorted(masses, key=lambda m: m[1])[:2]):
            stem(plant, feet[k], (x * 0.7, y - r * s * 0.5, z * 0.7), 0.035, 0.02, 3, straight=True)
        for x, y, z, r, s in masses:
            plant.clump((x, y, z), r * 1.04 * spec.get("body", 1.0), colour, squash=s / spec.get("body", 1.0), rough=0.34, stretch=0.2)
        return plant

    # near: a stem to every mass (and the rest to the masses again, as a shrub has more stems than crowns), a dark
    # core inside each mass, and the mass's outside in sprays of leaves on twigs, with sky between them
    for k, foot in enumerate(feet):
        x, y, z, r, s = masses[k % len(masses)]
        lean = 0.75 + 0.2 * rand.random()
        stem(plant, foot, (x * lean, y - r * s * 0.35, z * lean), 0.04 + 0.012 * rand.random(), 0.016, 3, bend=0.05 + 0.15 * rand.random())
    for x, y, z, r, s in masses:
        plant.clump((x, y, z), r * 0.82, lambda p, n: mix(greens[0], colour(p, n), 0.45), squash=s, rough=0.3)
        count = max(4, round(r * r * spec["sprays"]))
        for k in range(count):
            # Over the mass's outside, more on its top and its open sides than under it
            u = rand.random() * 2 * math.pi
            v = math.acos(1 - 2 * (0.04 + 0.78 * rand.random() ** 0.8))
            out = (math.sin(v) * math.cos(u), math.cos(v), math.sin(v) * math.sin(u))
            if (out[0] * x + out[2] * z) < -0.3 * math.hypot(x, z) and out[1] < 0.3:
                out = (-out[0], out[1], -out[2])
            depth = r * (0.78 + 0.22 * rand.random())
            root = (x + out[0] * depth, max(GROUND + 0.02, y + out[1] * depth * s), z + out[2] * depth)
            # The spray lies along the mass's outside, a little out of it and up, as leaves turn to the light: the
            # mass reads as leaves over its whole skin and its outline as their tips
            normal = Vector((out[0], out[1] * s, out[2])).normalized()
            tangent = normal.cross(Vector((rand.random() - 0.5, rand.random() - 0.5, rand.random() - 0.5))).normalized()
            way = tangent + normal * spec["out"] + Vector((0.0, spec.get("up", 0.2), 0.0))
            # A mat's sprays lie down along the ground
            way = tuple((way.x, way.y * spec.get("lie", 1.0), way.z))
            spray(plant, root, way, spec, colour, (x, y, z))
            if k % 6 == 0:
                plant.trunk([(x * 0.8, y - r * s * 0.3, z * 0.8, 0.013), (root[0], root[1], root[2], 0.006)], 3, *BARK)
    return plant


def spray(plant, root, way, spec, colour, centre):
    """A spray of `leaves` leaves fanned from `root` toward `way`, each a leaf folded on its midrib (two faces), its face
    turned away from the middle of its mass, so the outline of a mass is a fringe of leaf tips with sky between them."""
    rand = plant.rand
    d = Vector(way).normalized()
    side = d.cross(Vector((0.0, 1.0, 0.0)))
    if side.length < 1e-3:
        side = Vector((1.0, 0.0, 0.0))
    side.normalize()
    lift = side.cross(d).normalized()
    n = spec["leaves"]
    for i in range(n):
        t = (i / (n - 1) - 0.5) if n > 1 else 0.0
        turn = t * spec["fan"] + 0.25 * (rand.random() - 0.5)
        tilt = 0.35 * (rand.random() - 0.5)
        along = d * math.cos(turn) + side * math.sin(turn) + lift * tilt
        along.normalize()
        length = spec["leaf"][0] + (spec["leaf"][1] - spec["leaf"][0]) * rand.random()
        width = length * spec["narrow"]
        base = Vector(root) + d * (0.04 * i)
        tip = base + along * length
        across = along.cross(lift).normalized()
        face = across.cross(along).normalized()
        mid = base + along * length * 0.45 - face * width * 0.18
        left = mid + across * width * 0.5
        right = mid - across * width * 0.5
        points = [tuple(base), tuple(left), tuple(tip), tuple(right)]
        faces = [(0, 1, 2), (0, 2, 3)]
        # Each face looks away from the middle of its mass
        out = []
        for a, b, c in faces:
            pa, pb, pc = (Vector(points[j]) for j in (a, b, c))
            normal = (pb - pa).cross(pc - pa)
            away = (pa + pb + pc) / 3 - Vector(centre)
            out.append((a, b, c) if normal.dot(away) >= 0 else (a, c, b))
        normal = tuple(face if face.dot(Vector(points[2]) - Vector(centre)) >= 0 else -face)
        colours = [mix(colour(points[0], normal), colour(points[0], (0, -1, 0)), 0.5), colour(points[1], normal), colour(points[2], normal), colour(points[3], normal)]
        plant.add(points, out, colours)


def close_preview(scene, objects):
    """With TWISTY_PREVIEW=<directory>: the species in a row, each level behind the last, from a rider's eye 6 m off."""
    out = os.environ.get("TWISTY_PREVIEW")
    if not out:
        return
    from bike_kit import B, render
    levels = ("near", "mid", "far")
    for obj in objects:
        species, lod = obj.name.rsplit("_", 1)
        column = list(SHRUBS).index(species)
        obj.location = B(((column - (len(SHRUBS) - 1) / 2) * 3.2, -GROUND, -levels.index(lod) * 3.6))
    render(scene, os.path.join(out, "shrubs-close.png"), (0, 1.5, 7.5), (0, 0.5, -2.5), size=(1600, 800), lens=30)
    render(scene, os.path.join(out, "shrubs-near.png"), (0, 1.6, 8.0), (0, 0.55, 0), size=(1600, 700), lens=26)


def build():
    scene = common.reset(61)
    plants = [shrub(f"{species}_{lod}", species, lod) for species in SHRUBS for lod in ("near", "mid", "far")]
    objects = finish(scene, plants, OUT, lambda plant: BUDGETS[plant.name.rsplit("_", 1)[1]])
    close_preview(scene, objects)


build()
