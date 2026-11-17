# The conifers of the forest legs: a spruce, a slim fir and a pine, and the
# same three under snow for the winter leg. Each is a trunk and a stack of
# boughs: a bough is a skirt whose rim runs out to tips and back into notches,
# so the outline is branches and not a turned cone.
#   blender --background --factory-startup --python tools/blender/tree_conifer.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
from tree_kit import TREE_BUDGET, Plant, finish, mix, patches, srgb  # noqa: E402

OUT = os.path.join(common.ASSETS, "trees", "conifer.glb")

BARK = (srgb(0x33241A), srgb(0x5A4030))
PINE_BARK = (srgb(0x4A3020), srgb(0x9A5E36))
SNOW = (srgb(0xC4D2E2), srgb(0xF4F7FB))
# Needles: deep inside the bough, at its tips, and the cast a patch may take
GREENS = {
    "spruce": (srgb(0x183A24), srgb(0x427A42), srgb(0x5C883C)),
    "fir": (srgb(0x153A30), srgb(0x376F4C), srgb(0x44805C)),
    "pine": (srgb(0x1C3522), srgb(0x56803F), srgb(0x748C42)),
}


def bough(plant, centre, rim, apex, radius, points, greens, snowy, droop=0.3, notch=0.66):
    """One skirt of branches round the trunk at `centre` (x, z): its tips at height `rim`, its top at `apex`."""
    rand = plant.rand
    deep, tip, cast = greens
    cx, cz = centre
    rise = apex - rim
    phase = rand.random() * 2 * math.pi
    verts = [(cx, apex, cz)]
    colours = [mix(deep, tip, 0.25) if not snowy else SNOW[1]]
    # A shoulder ring: the bough leaves the trunk nearly level, then hangs
    for n in range(points):
        angle = phase + (n + 0.5 * rand.random()) * 2 * math.pi / points
        r = radius * (0.5 + 0.12 * rand.random())
        verts.append((cx + r * math.cos(angle), rim + rise * (0.5 + 0.14 * rand.random()), cz + r * math.sin(angle)))
        colours.append(mix(deep, tip, 0.35 + 0.25 * rand.random()) if not snowy else mix(SNOW[0], SNOW[1], 0.5 + 0.5 * rand.random()))
    tips = []
    for n in range(points * 2):
        angle = phase + (n / 2 + 0.25 + 0.2 * (rand.random() - 0.5)) * 2 * math.pi / points
        out = n % 2 == 0
        r = radius * ((0.9 + 0.25 * rand.random()) if out else notch * (0.85 + 0.3 * rand.random()))
        y = rim - (droop * rand.random() if out else -rise * 0.16 * rand.random())
        point = (cx + r * math.cos(angle), y, cz + r * math.sin(angle))
        verts.append(point)
        tips.append((angle, r, y))
        shade = mix(mix(deep, tip, 0.75 + 0.25 * rand.random() if out else 0.25), cast, max(0.0, patches(point)) * 0.7)
        if snowy:
            # Snow lies along the boughs and thins toward the notches between them
            shade = mix(SNOW[0], SNOW[1], rand.random()) if out else mix(deep, SNOW[0], 0.45)
        colours.append(shade)
    faces = []
    for n in range(points):
        faces.append((0, 1 + n, 1 + (n + 1) % points))
        a, b = 1 + n, 1 + (n + 1) % points
        o, i, o2 = 1 + points + 2 * n, 1 + points + 2 * n + 1, 1 + points + (2 * n + 2) % (2 * points)
        faces += [(a, o, i), (a, i, b), (b, i, o2)]
    plant.add(verts, faces, colours, facing="up")

    if snowy:
        # The dark needles under the snow load, showing past its rim
        under = [(cx, rim + rise * 0.45, cz)]
        for angle, r, y in tips[::2]:
            under.append((cx + r * 1.07 * math.cos(angle), y - 0.3, cz + r * 1.07 * math.sin(angle)))
        fan = [(0, 1 + n, 1 + (n + 1) % points) for n in range(points)]
        # Lighter than the needles above the snow: this side never sees the sky, and the bake darkens it
        plant.add(under, fan, [mix(deep, tip, 0.5)] + [mix(deep, tip, 0.8 + 0.2 * rand.random()) for _ in range(points)], facing="down")


def spruce(name, seed, snowy=False):
    """Full and regular: boughs to within two metres of the ground."""
    plant = Plant(name, seed)
    rand = plant.rand
    height = 9.4
    plant.trunk([(0, 0, 0, 0.5), (0, 1.3, 0, 0.36), (0, 3.2, 0, 0.24)], 5, *BARK)
    tiers = 6
    points = 6 if snowy else 8
    for n in range(tiers):
        f = n / (tiers - 1)
        rim = 1.9 + (height - 3.3) * f ** 1.08
        apex = min(height, rim + 2.5 - 0.7 * f) if n < tiers - 1 else height
        radius = (2.75 * (1 - f) ** 0.85 + 0.5) * (0.92 + 0.16 * rand.random())
        bough(plant, (0.08 * (rand.random() - 0.5), 0.08 * (rand.random() - 0.5)), rim, apex, radius, points, GREENS["spruce"], snowy, droop=0.35)
    return plant


def fir(name, seed, snowy=False):
    """Tall and narrow, its boughs short and close."""
    plant = Plant(name, seed)
    rand = plant.rand
    height = 10.8
    plant.trunk([(0, 0, 0, 0.46), (0, 1.3, 0, 0.33), (0, 3.6, 0, 0.2)], 5, *BARK)
    tiers = 8 if not snowy else 7
    points = 5
    for n in range(tiers):
        f = n / (tiers - 1)
        rim = 2.4 + (height - 3.5) * f
        apex = min(height, rim + 2.2 - 0.6 * f) if n < tiers - 1 else height
        radius = (1.75 * (1 - f) ** 0.7 + 0.38) * (0.85 + 0.3 * rand.random())
        bough(plant, (0.1 * (rand.random() - 0.5), 0.1 * (rand.random() - 0.5)), rim, apex, radius, points, GREENS["fir"], snowy, droop=0.5, notch=0.55)
    return plant


def pine(name, seed, snowy=False):
    """A bare, leaning trunk under a few broad pads of needles."""
    plant = Plant(name, seed)
    rand = plant.rand
    lean = (0.5, -0.3)
    spine = [(0, 0, 0, 0.48), (0.03, 1.3, 0, 0.36), (lean[0] * 0.45, 4.2, lean[1] * 0.45, 0.27), (lean[0], 7.4, lean[1], 0.17), (lean[0] * 1.1, 9.0, lean[1] * 1.1, 0.08)]
    plant.trunk(spine, 5, *PINE_BARK)
    # A dead stub or two below the crown
    for y, angle in ((3.4, 0.9), (4.6, 3.6)):
        x, z = lean[0] * (y - 1.3) / 6.1, lean[1] * (y - 1.3) / 6.1
        plant.trunk([(x, y, z, 0.07), (x + 0.75 * math.cos(angle), y + 0.28, z + 0.75 * math.sin(angle), 0.03)], 3, *PINE_BARK)
    pads = [(5.2, 2.5, 1.5, 0.95), (6.5, 2.9, 1.5, -0.6), (7.9, 2.3, 1.5, 0.3), (9.0, 1.45, 1.5, 0.0)]
    for rim, radius, rise, off in pads:
        angle = rand.random() * 2 * math.pi
        t = (rim - 1.3) / 6.1
        centre = (lean[0] * t + off * 0.5 * math.cos(angle), lean[1] * t + off * 0.5 * math.sin(angle))
        bough(plant, centre, rim, rim + rise, radius * (0.92 + 0.16 * rand.random()), 6 if snowy else 7, GREENS["pine"], snowy, droop=0.22, notch=0.72)
    return plant


def build():
    scene = common.reset(41)
    plants = [
        spruce("conifer_spruce", 411),
        fir("conifer_fir", 412),
        pine("conifer_pine", 413),
        spruce("conifer_spruce_snow", 411, snowy=True),
        fir("conifer_fir_snow", 412, snowy=True),
        pine("conifer_pine_snow", 413, snowy=True),
    ]
    finish(scene, plants, OUT, TREE_BUDGET)


build()
