# The trees as species, each at up to three levels of detail (tree_conifer.py, tree_broadleaf.py, tree_alpine.py):
#   near   for the trees nearest the rider on a world (the game draws about forty of them): a trunk that runs to
#          the top and tapers, the branches one by one, and the foliage in clumps or fronds with sky between them
#   mid    the shape the legs draw for every tree, and a world for the trees past the near ones
#   far    a few faces in the same outline, for the trees far off
# A species builds its levels from one layout (the heights, spreads and lobes drawn from its seed), so the outline
# stays the same when the game swaps one level for the next.
import math

from tree_kit import Plant, mix, patches, srgb

BUDGETS = {"near": 1400, "mid": 220, "far": 70}

BARK = (srgb(0x33241A), srgb(0x5A4030))
PINE_BARK = (srgb(0x4A3020), srgb(0x9A5E36))
LARCH_BARK = (srgb(0x3E2A1E), srgb(0x77553D))
SNOW = (srgb(0xC4D2E2), srgb(0xF4F7FB))
# Needles: deep inside the bough, at its tips, and the cast a patch may take
GREENS = {
    "spruce": (srgb(0x183A24), srgb(0x427A42), srgb(0x5C883C)),
    "fir": (srgb(0x153A30), srgb(0x376F4C), srgb(0x44805C)),
    "pine": (srgb(0x1C3522), srgb(0x56803F), srgb(0x748C42)),
    # Larch needles are soft and light, a yellow green
    "larch": (srgb(0x2C4422), srgb(0x7FA04A), srgb(0x9AA84A)),
}
BROAD_BARK = (srgb(0x3A2B1C), srgb(0x6A4C33))
PALE_BARK = (srgb(0x4C4438), srgb(0x8C8474))
# Leaves: the shaded underside, the crown in the light, and the cast a patch may take
LEAVES = {
    "oak": (srgb(0x21401F), srgb(0x6E953F), srgb(0x8A9B3C)),
    "beech": (srgb(0x1F4424), srgb(0x5C8F45), srgb(0x7FA048)),
    "ash": (srgb(0x27451F), srgb(0x79A046), srgb(0x9AA544)),
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


def frond(plant, root, angle, length, width, greens, droop=0.25, lift=0.0, fold=0.35, hang=0.0):
    """One branch of needles out from `root` (x, y, z) toward `angle`: a folded spray whose edge runs out into two
    side shoots a side and the tip, 10 faces, and with `hang` a curtain of branchlets under it (4 more), as a spruce
    has."""
    rand = plant.rand
    deep, tip, cast = greens
    x0, y0, z0 = root
    ca, sa = math.cos(angle), math.sin(angle)

    def at(u, side, dy):
        return (x0 + ca * u - sa * side, y0 + dy, z0 + sa * u + ca * side)

    def sag(t):
        return -droop * length * t ** 1.3 + lift * length * max(0.0, t - 0.55) ** 2 * 4

    def edge(t, w, side):
        half = width * length * w
        return at(length * t, side * half, sag(t) - fold * half)

    jitter = lambda: 0.9 + 0.2 * rand.random()
    verts = [at(0, 0, 0), at(length * 0.5, 0, sag(0.5)), at(length, 0, sag(1.0))]
    colours = [mix(deep, tip, 0.1), mix(deep, tip, 0.45), mix(tip, cast, 0.3)]
    faces = []
    for side in (1, -1):
        # The edge and the two shoots out past it, each a little its own length
        base = len(verts)
        verts += [edge(0.28, 0.36 * jitter(), side), edge(0.46, 0.62 * jitter(), side), edge(0.64, 0.3 * jitter(), side), edge(0.86, 0.42 * jitter(), side)]
        colours += [mix(deep, tip, 0.35), mix(tip, cast, max(0.0, patches(verts[base + 1])) * 0.6), mix(deep, tip, 0.55), mix(tip, cast, 0.2 + 0.3 * rand.random())]
        l1, s1, l2, s2 = base, base + 1, base + 2, base + 3
        faces += [(0, l1, 1), (l1, s1, l2), (l1, l2, 1), (1, l2, 2), (l2, s2, 2)]
        if hang > 0:
            drop = hang * length * (0.8 + 0.4 * rand.random())
            under = len(verts)
            verts += [(verts[l1][0], verts[l1][1] - drop * 0.8, verts[l1][2]), (verts[l2][0], verts[l2][1] - drop, verts[l2][2])]
            colours += [mix(deep, tip, 0.25), mix(deep, tip, 0.4)]
            faces += [(l1, l2, under + 1), (l1, under + 1, under)]
    plant.add(verts, faces, colours)


def whorls(rand, low, high, gap, jitter=0.12):
    """The heights of the branch whorls from `low` to `high`, about `gap` apart."""
    out = []
    y = low
    while y < high:
        out.append(y)
        y += gap * (1 + jitter * (rand.random() - 0.5) * 2)
    return out


# A conifer as a layout: its height, the trunk, the profile of its crown and how its branches hang
CONIFERS = {
    "spruce": {"height": 9.4, "low": 1.9, "spread": 2.75, "power": 0.85, "gap": 0.52, "count": 8, "droop": 0.36, "lift": 0.3, "fold": 0.4, "hang": 0.0, "width": 0.6, "core": 0.3, "near": 0.84, "bark": BARK},
    "fir": {"height": 10.8, "low": 2.4, "spread": 1.75, "power": 0.7, "gap": 0.56, "count": 8, "droop": 0.2, "lift": 0.18, "fold": 0.3, "hang": 0.0, "width": 0.7, "core": 0.3, "near": 0.78, "bark": BARK},
    "larch": {"height": 10.2, "low": 2.2, "spread": 2.3, "power": 0.95, "gap": 0.72, "count": 5, "droop": 0.3, "lift": 0.35, "fold": 0.25, "hang": 0.1, "width": 0.75, "core": 0.18, "near": 1.0, "bark": LARCH_BARK},
}


def conifer(name, seed, species, lod, snowy=False):
    """A spruce, a fir or a larch: a trunk and whorls of branches, narrowing to the leader."""
    spec = CONIFERS[species]
    plant = Plant(name, seed)
    rand = plant.rand
    greens = GREENS[species]
    height, low, spread, power = spec["height"], spec["low"], spec["spread"], spec["power"]

    def reach(y):
        f = max(0.0, min(1.0, (y - low) / (height - low)))
        return spread * (1 - f) ** power + 0.45 * (1 - f) + 0.3

    if lod == "near":
        # The trunk runs up to the leader, thick at the foot and flared into the ground
        plant.trunk([(0, 0, 0, 0.55), (0, 0.45, 0, 0.42), (0, 1.3, 0, 0.34), (0, low + 1.5, 0, 0.26), (0, height * 0.6, 0, 0.14), (0, height - 2.2, 0, 0.04)], 7, *spec["bark"])
        # A dark core inside the branches, so the sky does not show through the middle of the tree
        core = spec["core"]
        plant.trunk([(0, low + 0.15, 0, reach(low + 0.5) * core), (0, (low + height) / 2, 0, reach((low + height) / 2) * core), (0, height - 2.6, 0, 0.08)], 6, greens[0], mix(greens[0], greens[1], 0.35))
        heights = whorls(rand, low, height - 0.7, spec["gap"])
        phase = rand.random() * 2 * math.pi
        for k, y in enumerate(heights):
            f = (y - low) / (height - low)
            count = spec["count"] - (1 if f > 0.75 else 0)
            phase += 2.4
            for n in range(count):
                angle = phase + (n + 0.35 * (rand.random() - 0.5)) * 2 * math.pi / count
                # (`near`: the branches reach as far as the mid level's skirts, so the outline holds when the game
                # swaps one level for the other)
                length = reach(y) * spec["near"] * (0.82 + 0.36 * rand.random())
                trunk = 0.3 * (1 - f) + 0.06
                root = (trunk * math.cos(angle), y + 0.1, trunk * math.sin(angle))
                frond(plant, root, angle, length, spec["width"] * (0.9 + 0.2 * rand.random()), greens,
                      droop=spec["droop"] * (1.2 - 0.6 * f) * (0.7 + 0.6 * rand.random()), lift=spec["lift"], fold=spec["fold"], hang=spec["hang"] if f < 0.5 else 0.0)
        # The leader
        # The leader: the year's shoot, as light as the tips
        plant.trunk([(0, height - 2.3, 0, 0.05), (0, height, 0, 0.012)], 3, greens[1], mix(greens[1], greens[2], 0.5))
        return plant

    if lod == "far":
        plant.trunk([(0, 0, 0, 0.5), (0, low + 0.6, 0, 0.3)], 3, *spec["bark"])
        tiers = 3
        for n in range(tiers):
            f = n / tiers
            rim = low + (height - low) * f * 0.92
            apex = height if n == tiers - 1 else low + (height - low) * (f + 0.55)
            bough(plant, (0, 0), rim, apex, reach(rim) * 1.02, 4, greens, False, droop=0.3 * (1 - f), notch=0.6)
        return plant

    # mid: a stack of skirts with notched rims (the shapes the legs have drawn since the modelled trees came in)
    if species == "spruce":
        plant.trunk([(0, 0, 0, 0.5), (0, 1.3, 0, 0.36), (0, 3.2, 0, 0.24)], 5, *BARK)
        tiers = 6
        points = 6 if snowy else 8
        for n in range(tiers):
            f = n / (tiers - 1)
            rim = 1.9 + (height - 3.3) * f ** 1.08
            apex = min(height, rim + 2.5 - 0.7 * f) if n < tiers - 1 else height
            radius = (2.75 * (1 - f) ** 0.85 + 0.5) * (0.92 + 0.16 * rand.random())
            bough(plant, (0.08 * (rand.random() - 0.5), 0.08 * (rand.random() - 0.5)), rim, apex, radius, points, greens, snowy, droop=0.35)
        return plant
    if species == "fir":
        plant.trunk([(0, 0, 0, 0.46), (0, 1.3, 0, 0.33), (0, 3.6, 0, 0.2)], 5, *BARK)
        tiers = 8 if not snowy else 7
        points = 5
        for n in range(tiers):
            f = n / (tiers - 1)
            rim = 2.4 + (height - 3.5) * f
            apex = min(height, rim + 2.2 - 0.6 * f) if n < tiers - 1 else height
            radius = (1.75 * (1 - f) ** 0.7 + 0.38) * (0.85 + 0.3 * rand.random())
            bough(plant, (0.1 * (rand.random() - 0.5), 0.1 * (rand.random() - 0.5)), rim, apex, radius, points, greens, snowy, droop=0.5, notch=0.55)
        return plant
    # larch: open, deeply notched skirts with the trunk showing between them
    plant.trunk([(0, 0, 0, 0.46), (0, 1.3, 0, 0.34), (0, height * 0.55, 0, 0.17), (0, height - 0.6, 0, 0.05)], 5, *spec["bark"])
    tiers = 6
    for n in range(tiers):
        f = n / (tiers - 1)
        rim = low + (height - low - 1.1) * f
        apex = min(height, rim + 1.5 - 0.3 * f) if n < tiers - 1 else height
        bough(plant, (0, 0), rim, apex, reach(rim) * (0.92 + 0.16 * rand.random()), 6, greens, False, droop=0.55, notch=0.42)
    return plant


def pine(name, seed, lod, snowy=False):
    """A bare, leaning trunk under a few broad pads of needles."""
    plant = Plant(name, seed)
    rand = plant.rand
    greens = GREENS["pine"]
    lean = (0.5, -0.3)
    spine = [(0, 0, 0, 0.48), (0.03, 1.3, 0, 0.36), (lean[0] * 0.45, 4.2, lean[1] * 0.45, 0.27), (lean[0], 7.4, lean[1], 0.17), (lean[0] * 1.1, 9.0, lean[1] * 1.1, 0.08)]
    pads = [(5.2, 2.5, 1.5, 0.95), (6.5, 2.9, 1.5, -0.6), (7.9, 2.3, 1.5, 0.3), (9.0, 1.45, 1.5, 0.0)]

    def axis(y):
        t = (y - 1.3) / 6.1
        return lean[0] * t, lean[1] * t

    if lod == "mid":
        plant.trunk(spine, 5, *PINE_BARK)
        # A dead stub or two below the crown
        for y, angle in ((3.4, 0.9), (4.6, 3.6)):
            x, z = axis(y)
            plant.trunk([(x, y, z, 0.07), (x + 0.75 * math.cos(angle), y + 0.28, z + 0.75 * math.sin(angle), 0.03)], 3, *PINE_BARK)
        for rim, radius, rise, off in pads:
            angle = rand.random() * 2 * math.pi
            ax, az = axis(rim)
            centre = (ax + off * 0.5 * math.cos(angle), az + off * 0.5 * math.sin(angle))
            bough(plant, centre, rim, rim + rise, radius * (0.92 + 0.16 * rand.random()), 6 if snowy else 7, greens, snowy, droop=0.22, notch=0.72)
        return plant
    if lod == "far":
        plant.trunk(spine[:2] + spine[3:4], 3, *PINE_BARK)
        for rim, radius, rise, off in pads[::2]:
            ax, az = axis(rim)
            bough(plant, (ax, az), rim, rim + rise * 1.3, radius * 1.05, 4, greens, False, droop=0.2, notch=0.7)
        return plant

    # near: the trunk to the top, limbs out to each pad, and each pad a cluster of needle clumps
    plant.trunk(spine, 7, *PINE_BARK)
    for y, angle in ((3.4, 0.9), (4.0, 2.2), (4.6, 3.6)):
        x, z = axis(y)
        plant.trunk([(x, y, z, 0.07), (x + 0.75 * math.cos(angle), y + 0.28, z + 0.75 * math.sin(angle), 0.03)], 3, *PINE_BARK)

    def needles(point, normal):
        lift = max(0.0, min(1.0, 0.5 + 0.5 * normal[1]))
        return mix(mix(greens[0], greens[1], 0.25 + 0.65 * lift), greens[2], max(0.0, patches(point)) * 0.6)

    for rim, radius, rise, off in pads:
        ax, az = axis(rim)
        limbs = 3 if radius > 2 else 2
        for n in range(limbs):
            angle = rand.random() * 2 * math.pi
            far = radius * (0.55 + 0.35 * rand.random())
            end = (ax + far * math.cos(angle), rim + rise * (0.2 + 0.3 * rand.random()), az + far * math.sin(angle))
            plant.trunk([(ax, rim - 0.3, az, 0.12), ((ax + end[0]) / 2, (rim + end[1]) / 2 + 0.15, (az + end[2]) / 2, 0.07), (end[0], end[1], end[2], 0.035)], 4, *PINE_BARK)
            for k in range(3):
                spot = (end[0] + 0.6 * (rand.random() - 0.5), end[1] + 0.25 + 0.2 * rand.random(), end[2] + 0.6 * (rand.random() - 0.5))
                plant.clump(spot, radius * (0.28 + 0.08 * rand.random()), needles, squash=0.42, rough=0.32)
        # The pad's middle, over the trunk
        plant.clump((ax, rim + rise * 0.5, az), radius * 0.42, needles, squash=0.4, rough=0.3)
    return plant


# A broadleaf as a layout: its trunk and limbs (a spine of (x, y, z, radius)), and the lobes of its crown
# (x, y, z, radius, squash). The near tree hangs leaf clumps on the lobes' outsides; the mid tree is one clump to a
# lobe; the far tree three clumps over the largest lobes.
BROADLEAVES = {
    "oak": {
        "bark": BROAD_BARK, "trunk": [(0, 0, 0, 0.52), (0.02, 1.3, 0, 0.38), (0.1, 2.9, 0.05, 0.31), (0.15, 4.3, 0.05, 0.22)],
        "lobes": [(0.0, 5.4, 0.0, 1.9, 0.85), (1.75, 4.5, 0.6, 1.45, 0.8), (-1.6, 4.6, -0.8, 1.45, 0.8), (0.4, 6.7, -0.4, 1.35, 0.8), (-0.5, 4.8, 1.7, 1.25, 0.8), (0.6, 4.5, -1.8, 1.15, 0.8), (-1.1, 6.2, 0.6, 1.0, 0.8)],
        "fork": 2.6,
    },
    "beech": {
        "bark": PALE_BARK, "trunk": [(0, 0, 0, 0.44), (0, 1.3, 0, 0.32), (-0.05, 3.0, 0.05, 0.25), (0.0, 4.4, 0.0, 0.16)],
        "lobes": [(0.0, 4.4, 0.0, 1.4, 1.0), (0.5, 5.9, 0.2, 1.45, 1.0), (-0.45, 7.2, 0.1, 1.3, 1.05), (0.15, 8.5, -0.1, 0.95, 1.1), (1.15, 4.5, -0.6, 0.95, 0.85), (-1.05, 5.4, 0.7, 0.95, 0.9), (0.2, 6.6, -1.0, 0.85, 0.9)],
        "fork": 2.6,
    },
    "ash": {
        "bark": BROAD_BARK, "trunk": [(0, 0, 0, 0.47), (-0.02, 1.3, 0, 0.35), (-0.1, 2.6, 0.0, 0.3), (-0.05, 3.6, 0.05, 0.22)],
        "lobes": [(-1.5, 5.0, 0.2, 1.4, 0.8), (-2.1, 4.4, -0.8, 1.0, 0.75), (-1.0, 4.3, 1.3, 1.0, 0.75), (1.4, 5.8, -0.2, 1.5, 0.8), (2.1, 5.0, 0.8, 1.0, 0.75), (0.3, 6.8, 0.3, 1.2, 0.85), (1.1, 5.0, -1.5, 0.95, 0.75), (-0.4, 6.0, -0.6, 1.0, 0.8)],
        "fork": 2.6,
    },
}


def leaves(greens, low, high):
    """A crown's colour by height and by how far a point looks up, with slow patches of another cast."""
    shade, light, cast = greens

    def colour(point, normal):
        lift = (point[1] - low) / (high - low)
        t = max(0.0, min(1.0, 0.55 * lift + 0.45 * (normal[1] * 0.5 + 0.5)))
        return mix(mix(shade, light, t ** 1.15), cast, max(0.0, patches(point, 0.4)) * 0.8 * t)
    return colour


def broadleaf(name, seed, species, lod):
    spec = BROADLEAVES[species]
    plant = Plant(name, seed)
    rand = plant.rand
    lobes = spec["lobes"]
    low = min(y - r * s for _, y, _, r, s in lobes)
    high = max(y + r * s for _, y, _, r, s in lobes)
    colour = leaves(LEAVES[species], low, high)
    top = spec["trunk"][-1]
    fork = spec["fork"]

    if lod == "far":
        # The trunk runs up into the crown, so no crown floats over a stump
        cx = sum(lobe[0] for lobe in lobes) / len(lobes)
        cz = sum(lobe[2] for lobe in lobes) / len(lobes)
        plant.trunk([spec["trunk"][0], (cx * 0.5, low + 0.6, cz * 0.5, 0.12)], 3, *spec["bark"])
        for x, y, z, r, s in sorted(lobes, key=lambda lobe: -lobe[3])[:3]:
            plant.clump((x, y, z), r * 1.3, colour, squash=s, rough=0.2)
        return plant

    if lod == "mid":
        plant.trunk(spec["trunk"], 5, *spec["bark"])
        # Two limbs to the lowest lobes, which show under the crown
        for x, y, z, r, s in sorted(lobes, key=lambda lobe: lobe[1])[:2]:
            plant.trunk([(top[0] * 0.5, fork, top[2] * 0.5, 0.18), (x * 0.7, y - r * s * 0.6, z * 0.7, 0.08)], 4, *spec["bark"])
        for x, y, z, r, s in lobes:
            plant.clump((x, y, z), r * 1.02, colour, squash=s, rough=0.3)
        return plant

    # near: the trunk, a limb to every lobe and a branch to each clump, the clumps on the lobe's outside
    plant.trunk([(spec["trunk"][0][0], 0, spec["trunk"][0][2], spec["trunk"][0][3] * 1.15)] + spec["trunk"], 7, *spec["bark"])
    for x, y, z, r, s in lobes:
        base = (top[0] * 0.4, fork + 0.4 * rand.random(), top[2] * 0.4)
        elbow = ((base[0] + x) * 0.5, (base[1] + y) * 0.5 + 0.2, (base[2] + z) * 0.5)
        plant.trunk([(base[0], base[1], base[2], 0.16), (elbow[0], elbow[1], elbow[2], 0.1), (x * 0.9, y - 0.1, z * 0.9, 0.05)], 4, *spec["bark"])
        # A dark mass inside the lobe: the depth of the crown, so the sky shows only at its edges
        plant.clump((x, y, z), r * 0.74, lambda p, n: mix(LEAVES[species][0], colour(p, n), 0.45), squash=s, rough=0.2)
        count = max(3, round(r * r * 2.1))
        for k in range(count):
            # Spread over the lobe's outside, more on its top and its open sides than under it
            u = rand.random() * 2 * math.pi
            v = math.acos(1 - 2 * (0.08 + 0.84 * rand.random() ** 0.8))
            out = (math.sin(v) * math.cos(u), math.cos(v), math.sin(v) * math.sin(u))
            if (out[0] * x + out[2] * z) < -0.4 * math.hypot(x, z) and out[1] < 0.2:
                out = (-out[0], out[1], -out[2])
            depth = r * (0.6 + 0.3 * rand.random())
            spot = (x + out[0] * depth, y + out[1] * depth * s, z + out[2] * depth)
            plant.clump(spot, r * (0.44 + 0.14 * rand.random()), colour, squash=0.62, rough=0.34, stretch=0.35)
            if k % 2 == 0:
                plant.trunk([(x * 0.9, y - 0.1, z * 0.9, 0.045), (spot[0], spot[1] - 0.1, spot[2], 0.02)], 3, *spec["bark"])
    return plant
