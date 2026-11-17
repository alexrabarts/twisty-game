# Helpers for the detailed bikes of group B (bike04_scrambler.py,
# bike05_g310gs.py, bike06_z750.py), on top of the shared kit (bike_kit.py,
# bike_parts.py). Same axes as the kit: x across (+x the rider's right), y up,
# z forward, metres, ground at y = 0, the wheelbase centred on z = 0. These
# bikes are modelled at their real size (wheelbase, wheels, seat from the
# maker's spec), not at the game's slightly small procedural size.
#
# A detailed bike file holds two levels of detail. `make` builds the bike
# twice, once with the kit's full detail and once with `low`, and merges the
# two exports into one glb whose two root nodes `lod0` and `lod1` hold the
# same node names (body, wheel_front, ..., grip, peg) at the same pivots. The
# lod1 nodes come first in the node list, so a reader that keeps the last node
# of each name (js/sceneassets.js) reads lod0.
# The game draws +x on the rider's left, so it mirrors this kit's files as
# it loads them (BIKE_MODELS `mirror` in js/vehicle.js).
import json
import math
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import bike_parts as parts  # noqa: E402,F401
from bike_kit import LOW, MATERIALS, Kit, render  # noqa: E402
from common import ASSETS  # noqa: E402

OUT_DIR = os.path.join(ASSETS, "bikes", "detail")
LOD0_BUDGET = 40000
LOD1_BUDGET = 10000
SIZE_BUDGET = 1200 * 1024

# Finishes these bikes need beyond the kit's. Names the game's palette does
# not hold (js/vehicle.js makeBikePalette), so each keeps its colour from the
# file: only `paint` takes the character's colour.
EXTRA = {
    "wheel_black": (0x141518, 0.45, 0.6),
    "alu": (0xB9BDC2, 0.3, 0.9),
    "silver": (0xA9ADB3, 0.28, 0.75),
    "grey": (0x7C7F84, 0.35, 0.55),
    "white": (0xE6E7E8, 0.3, 0.2),
    "gold": (0xC9973A, 0.3, 0.85),
    "black_gloss": (0x0D0E10, 0.15, 0.5),
    "header": (0x8A6A4E, 0.35, 0.9),
    "engine_black": (0x1E1F23, 0.6, 0.5),
    "fin": (0x5F636A, 0.4, 0.85),
    "can_black": (0x1A1B1E, 0.4, 0.6),
    "lens_red": (0x9E0E0E, 0.15, 0.2),
    "bag": (0x1D1E21, 0.85, 0.05),
    "bag_grey": (0x4A4D52, 0.8, 0.05),
    "patch": (0x5DB4E0, 0.6, 0.05),
}
MATERIALS.update({name: value for name, value in EXTRA.items() if name not in MATERIALS})
# Reads alike from a distance
LOW.update({"fin": "engine_black", "header": "steel", "lens_red": "brake"})

FACES = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
X = Vector((1, 0, 0))


def obox(k, centre, axes, size, mat, bevel=0.004, **kw):
    """A box about `centre` whose local x, y, z are the vectors `axes`."""
    c = Vector(centre)
    hx, hy, hz = (s / 2 for s in size)
    a, b, d = (Vector(v) for v in axes)
    verts = [c + a * x + b * y + d * z for z in (-hz, hz) for y in (-hy, hy) for x in (-hx, hx)]
    return k.emit(verts, FACES, mat, bevel=bevel, **kw)


def wheel_axes(angle):
    """Radial and tangent directions at `angle` round an axle on x (degrees from straight ahead, up over the top)."""
    a = math.radians(angle)
    return Vector((0, math.sin(a), math.cos(a))), Vector((0, math.cos(a), -math.sin(a)))


# ---------------------------------------------------------------- wheels


def tyre(k, centre, radius, width, rim, tread="road", seg=None):
    """A tyre on x about `centre`. tread: road (a few sipes), dual (blocks)."""
    seg = seg or (18 if k.low else (64 if tread == "dual" else 48))
    steps = 4 if k.low else 10
    tube = rim + 0.38 * (radius - rim)
    profile = [(rim - 0.004, -0.36 * width), (rim + 0.016, -0.43 * width)]
    for j in range(steps + 1):
        a = math.radians(-90 + 180 * j / steps)
        squash = 1.0 if tread == "road" else 0.85
        profile.append((tube + (radius - tube) * math.cos(a) ** squash if math.cos(a) > 0 else tube, math.sin(a) * width / 2))
    profile += [(rim + 0.016, 0.43 * width), (rim - 0.004, 0.36 * width)]

    def groove(i, j):
        row = j - 2
        if k.low or row < 1 or row > steps - 1:
            return 0.0
        if tread == "dual":
            # Blocks staggered row to row, a channel down the middle
            if row == steps // 2:
                return -0.006 if i % 2 else 0.0
            return -0.009 if (i + (row % 3)) % 3 == 0 else 0.0
        lean = row if row < steps // 2 else steps - row
        return -0.004 if (row != steps // 2 and (i + lean) % 6 == 0) else 0.0

    k.lathe(profile, centre, "rubber", axis="x", seg=seg, ripple=groove, sharp=55)


def rim_barrel(k, centre, rim, width, mat="wheel_black", stripe=None):
    w = width
    barrel = [(rim + 0.008, -0.44 * w), (rim - 0.022, -0.41 * w), (rim - 0.032, -0.18 * w),
              (rim - 0.032, 0.18 * w), (rim - 0.022, 0.41 * w), (rim + 0.008, 0.44 * w)]
    k.lathe(barrel, centre, mat, axis="x", seg=14 if k.low else 40, sharp=40)
    if stripe and not k.low:
        for side in (-1, 1):
            x0, x1 = side * 0.442 * w, side * 0.452 * w
            k.lathe([(rim - 0.012, x1), (rim + 0.004, x1), (rim + 0.004, x0)], centre, stripe, axis="x", seg=40, sharp=60)


def spoke(k, centre, a0, a1, r0, r1, half0, half1, deep0, deep1, mat, x0=0.0, x1=0.0, mid=None):
    """A cast spoke from radius r0 at angle a0 (radians) to r1 at a1, rectangular in section, through `mid` (a, r) if given."""
    stations = [(a0, r0, half0, deep0, x0)]
    if mid:
        stations.append((mid[0], mid[1], (half0 + half1) / 2, (deep0 + deep1) / 2, (x0 + x1) / 2))
    stations.append((a1, r1, half1, deep1, x1))
    c = Vector(centre)
    verts, faces = [], []
    for a, r, half, deep, xo in stations:
        out = Vector((0, math.cos(a), math.sin(a)))
        along = Vector((0, -math.sin(a), math.cos(a)))
        for dx in (-deep, deep):
            for dt in (-half, half):
                verts.append(c + out * r + along * dt + Vector((dx + xo, 0, 0)))
    for n in range(len(stations) - 1):
        b = n * 4
        faces += [(b, b + 4, b + 5, b + 1), (b + 2, b + 3, b + 7, b + 6), (b, b + 2, b + 6, b + 4), (b + 1, b + 5, b + 7, b + 3)]
    last = (len(stations) - 1) * 4
    faces += [(0, 1, 3, 2), (last, last + 2, last + 3, last + 1)]
    return k.emit(verts, faces, mat, bevel=0 if k.low else 0.003, sharp=40)


def wheel(k, centre, radius, width, rim, spokes=10, style="straight", tread="road", mat="wheel_black", hub=0.055, hub_width=None, stripe=None):
    """Tyre, rim, cast spokes and hub. style: straight (thin straight spokes),
    twin (pairs that part toward the rim), y (each spoke forks at the rim),
    swept (curved spokes)."""
    tyre(k, centre, radius, width, rim, tread)
    rim_barrel(k, centre, rim, width, mat, stripe)
    inner = rim - 0.028
    hw = hub_width or width * 0.45
    count = spokes
    if k.low:
        # Broad flat blades are all that shows from a distance
        for i in range(min(count, 6)):
            a = 2 * math.pi * i / min(count, 6)
            spoke(k, centre, a, a + 0.12, hub * 0.8, inner + 0.008, 0.016, 0.022, 0.012, 0.01, mat)
    else:
        for i in range(count):
            a = 2 * math.pi * i / count
            if style == "straight":
                spoke(k, centre, a, a, hub * 0.85, inner + 0.008, 0.011, 0.008, 0.012, 0.008, mat)
            elif style == "twin":
                for s in (-1, 1):
                    spoke(k, centre, a + s * 0.07, a + s * 0.2, hub * 0.85, inner + 0.008, 0.01, 0.007, 0.013, 0.008, mat)
            elif style == "y":
                spoke(k, centre, a, a, hub * 0.85, inner * 0.55, 0.014, 0.011, 0.014, 0.011, mat)
                for s in (-1, 1):
                    spoke(k, centre, a + s * 0.03, a + s * 0.24, inner * 0.52, inner + 0.008, 0.009, 0.008, 0.011, 0.008, mat)
            elif style == "swept":
                spoke(k, centre, a, a + 0.42, hub * 0.85, inner + 0.008, 0.012, 0.008, 0.013, 0.008, mat, mid=(a + 0.12, (hub + inner) * 0.5))
    # Hub with its bearing caps
    k.lathe([(0, -hw), (hub * 0.55, -hw), (hub * 0.7, -hw * 0.85), (hub, -hw * 0.5), (hub * 1.15, -0.012), (hub * 1.15, 0.012), (hub, hw * 0.5), (hub * 0.7, hw * 0.85), (hub * 0.55, hw), (0, hw)],
            centre, mat, axis="x", seg=10 if k.low else 20, sharp=45)
    if not k.low:
        for s in (-1, 1):
            k.cylinder(0.016, 0.012, (centre[0] + s * hw, centre[1], centre[2]), "steel", axis="x", seg=10)


def disc(k, centre, radius, petal=0, holes=24, carrier="dark_metal", thick=0.005, arms=6, inner_frac=0.68):
    """A brake disc about `centre` on x: a ring (waved when `petal` gives the
    number of waves) on a carrier, with drillings on both faces."""
    cx, cy, cz = centre
    inner = radius * inner_frac
    seg = 24 if k.low else (petal * 6 if petal else 48)
    verts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        outer = radius
        if petal:
            # A scalloped edge: every wave dips toward the middle of its span
            phase = (i % 6) / 6
            outer = radius - 0.009 * math.sin(math.pi * phase) ** 1.5
        for r in (inner, outer):
            for dx in (-thick / 2, thick / 2):
                verts.append((cx + dx, cy + math.cos(a) * r, cz + math.sin(a) * r))
    faces = []
    for i in range(seg):
        a, b = i * 4, ((i + 1) % seg) * 4
        faces += [(a, b, b + 2, a + 2), (a + 1, a + 3, b + 3, b + 1), (a, a + 1, b + 1, b), (a + 2, b + 2, b + 3, a + 3)]
    k.emit(verts, faces, "disc", sharp=30)
    if not k.low and holes:
        # Drilled holes as dark dots standing just proud of each face, in two staggered rings
        for i in range(holes):
            a = 2 * math.pi * i / holes
            r = inner + (radius - inner) * (0.38 if i % 2 else 0.66)
            for side in (-1, 1):
                k.cylinder(0.0042, 0.0012, (cx + side * (thick / 2 + 0.0005), cy + math.cos(a) * r, cz + math.sin(a) * r), "vent", axis="x", seg=6)
    # Carrier: a boss and arms out to the ring, with the float buttons
    k.lathe([(0, -thick * 1.2), (radius * 0.3, -thick * 1.2), (radius * 0.3, thick * 1.2), (0, thick * 1.2)], centre, carrier, axis="x", seg=12 if k.low else 24)
    if k.low:
        return
    for i in range(arms):
        a = 2 * math.pi * (i + 0.5) / arms
        mid = (inner + radius * 0.28) / 2
        k.box((thick * 1.6, inner - radius * 0.24, 0.02), (cx, cy + math.cos(a) * mid, cz + math.sin(a) * mid), carrier, rot=(a, 0, 0), bevel=0)
        k.cylinder(0.006, thick * 2.2, (cx, cy + math.cos(a) * (inner + 0.003), cz + math.sin(a) * (inner + 0.003)), "steel", axis="x", seg=8)


def caliper(k, centre, disc_r, angle, mat="caliper", length=0.11, radial=0.052, width=0.056, pistons=2, mount=None):
    """A caliper straddling the disc of radius `disc_r` at `angle` round the
    axle (degrees from straight ahead, up over the top): an outer and an inner
    half joined over the rim, piston bulges on the outer face. `mount` (a point)
    adds a bracket arm to it in the same finish."""
    out, tangent = wheel_axes(angle)
    c = Vector(centre) + out * (disc_r * 0.83)
    cx = centre[0]
    axes = (X, out, tangent)
    for s in (-1, 1):
        obox(k, c + X * (s * width * 0.3), axes, (width * 0.38, radial, length), mat, bevel=0.007)
    obox(k, c + out * (radial * 0.36), axes, (width, radial * 0.34, length * 0.86), mat, bevel=0.006)
    if not k.low:
        side = 1 if cx >= 0 else -1
        for p in range(pistons):
            t = (p - (pistons - 1) / 2) * length * 0.42
            k.lathe([(0, 0), (0.017, 0), (0.017, 0.012), (0, 0.016)], tuple(c + X * (side * width * 0.49) + tangent * t), mat, to=tuple(c + X * (side * width * 0.9) + tangent * t), seg=10)
        # Pad pin across the bridge
        k.rod(tuple(c + out * (radial * 0.5) - X * width * 0.55), tuple(c + out * (radial * 0.5) + X * width * 0.55), 0.004, mat, seg=6)
    if mount is not None:
        # The torque arm, from the caliper's outer face so it clears the disc
        start = c + X * ((1 if cx >= 0 else -1) * width * 0.5)
        k.tube([tuple(start), tuple(Vector(mount))], 0.012, "dark_metal", seg=6)
    return c


# ---------------------------------------------------------------- front end


def fork_line(axle, top, t):
    return (axle[0] + (top[0] - axle[0]) * t, axle[1] + (top[1] - axle[1]) * t)


def forks(k, x, axle, top, radius, usd=True, outer="dark_metal", inner="chrome", disc_r=0.15, disc_x=0.065, disc_sides=(1,), caliper_angle=205,
          caliper_mat="caliper", yoke="dark_metal", caps="steel_dark", bottom=None, pivot_t=0.5):
    """Both fork legs as their own nodes, their front calipers on the legs that
    carry a disc. The yokes, the stem and the axle go in the body."""
    ay, az = axle
    ty, tz = top
    for side, name in ((-1, "fork_left"), (1, "fork_right")):
        py, pz = fork_line(axle, top, pivot_t)
        k.begin(name, (side * x, py, pz))
        a = (side * x, ay, az)
        b = (side * x, ty, tz)
        P = lambda t: (side * x, *fork_line(axle, top, t))  # noqa: E731
        if usd:
            # Slider (thin, chrome) below, thick outer tube above
            k.rod(P(0.07), P(0.5), radius, inner, seg=10 if k.low else 16)
            k.rod(P(0.44), b, radius * 1.42, outer, seg=12 if k.low else 20)
            k.rod(P(0.42), P(0.46), radius * 1.5, outer, seg=12 if k.low else 20)
            # Axle clamp foot
            k.lathe([(0, -0.04), (radius * 1.25, -0.04), (radius * 1.4, -0.01), (radius * 1.4, 0.06), (radius * 1.05, 0.11), (0, 0.11)], P(0.0), bottom or outer, to=b, seg=10 if k.low else 16)
        else:
            k.rod(P(0.0), P(0.55), radius * 1.38, outer, seg=12 if k.low else 20)
            k.rod(P(0.5), b, radius, inner, seg=10 if k.low else 16)
            k.rod(P(0.53), P(0.57), radius * 1.45, "rubber", seg=10 if k.low else 16)
        k.cylinder(radius * 1.25 if not usd else radius * 1.42, 0.02, b, caps, seg=10, rot=(math.atan2(az - tz, ty - ay), 0, 0))
        k.box((radius * 3.0, 0.07, 0.07), a, bottom or outer, bevel=0.012)
        if side in disc_sides:
            caliper(k, (side * disc_x, ay, az), disc_r, caliper_angle, mat=caliper_mat)
            if not k.low:
                # The caliper's lugs bolt onto the back of the leg
                out, tangent = wheel_axes(caliper_angle)
                c = Vector((side * disc_x, ay, az)) + out * (disc_r * 0.83)
                for s in (-1, 1):
                    lug = c + tangent * (s * 0.04) + X * (side * 0.02)
                    k.tube([tuple(lug), tuple(Vector(P(0.04 + 0.06 * (s + 1) / 2)))], 0.009, "dark_metal", seg=6)
    k.begin("body")
    k.rod((-x - 0.025, ay, az), (x + 0.025, ay, az), 0.012, "steel", seg=8)
    lean = math.atan2(az - tz, ty - ay)
    for t, deep in ((0.985, 0.032), (0.8, 0.045)):
        y, z = fork_line(axle, top, t)
        k.box((x * 2 + radius * 4.6, deep, 0.085), (0, y, z - 0.018), yoke, rot=(lean, 0, 0), bevel=0.01)
    return lean


def round_lamp(k, centre, radius, depth=0.11, shell="dark_metal", ring="chrome", tilt=0.0, ring_led=False):
    """A round headlamp facing forward: shell, rim, a domed lens; `ring_led` adds a lit ring inside the lens."""
    c = Vector(centre)
    to = c + Vector((0, math.sin(tilt), math.cos(tilt)))
    back = c - Vector((0, math.sin(tilt), math.cos(tilt))) * depth
    k.lathe([(0, 0), (radius * 0.45, 0.0), (radius * 0.85, depth * 0.45), (radius, depth * 0.88), (radius, depth)], tuple(back), shell, to=tuple(to + (back - c)), seg=14 if k.low else 32)
    k.lathe([(radius * 0.9, 0), (radius * 1.04, 0), (radius * 1.04, 0.012), (radius * 0.92, 0.018)], tuple(c - (to - c) * 0.004), ring, to=tuple(to), seg=14 if k.low else 32)
    k.lathe([(radius * 0.92, 0), (radius * 0.7, 0.012), (0, 0.02)], tuple(c), "headlight", to=tuple(to + (to - c)), seg=14 if k.low else 32)
    if ring_led and not k.low:
        k.lathe([(radius * 0.74, 0.0), (radius * 0.8, 0.0), (radius * 0.8, 0.004), (radius * 0.74, 0.004)], tuple(c + (to - c) * 0.012), "white", to=tuple(to + (to - c) * 0.012), seg=32)
        k.lathe([(radius * 0.32, 0.0), (radius * 0.0, 0.025)], tuple(c + (to - c) * 0.004), "chrome", to=tuple(to + (to - c)), seg=16)


def indicator(k, root, tip, radius=0.018, stalk="dark_metal", lens="signal", length=0.04):
    """A stalk from `root` to `tip` with a bullet lamp on its end, pointing outward along the stalk."""
    r, t = Vector(root), Vector(tip)
    k.rod(tuple(r), tuple(t), 0.0065, stalk, seg=6)
    d = (t - r).normalized()
    k.lathe([(0, 0), (radius * 0.7, 0), (radius, length * 0.35), (radius, length * 0.7), (0, length)], tuple(t - d * 0.004), lens, to=tuple(t + d), seg=8 if k.low else 14)


def mirror(k, root, stem, head, size=(0.06, 0.04), mat="dark_metal", round_head=False):
    """Mirrors both sides: a stalk from `root` through `stem` up to a head at `head` (right side given)."""
    for side in (-1, 1):
        f = lambda p: (side * p[0], p[1], p[2])  # noqa: E731
        w, h = size
        b = f(head)
        if k.low:
            # One mesh for stalk and head: the low kit drops any part under a
            # hand's span, which a head alone is
            verts, faces = [], []
            for a0, a1, half in ((f(root), f(stem), 0.007), (f(stem), b, 0.007)):
                n = len(verts)
                for end in (a0, a1):
                    for dx, dz in ((-half, -half), (half, -half), (half, half), (-half, half)):
                        verts.append((end[0] + dx, end[1], end[2] + dz))
                faces += [(n + i, n + (i + 1) % 4, n + 4 + (i + 1) % 4, n + 4 + i) for i in range(4)]
                faces += [(n + 3, n + 2, n + 1, n), (n + 4, n + 5, n + 6, n + 7)]
            n = len(verts)
            for z in (-0.012, 0.012):
                for y in (-h, h):
                    for x in (-w, w):
                        verts.append((b[0] + side * 0.01 + x, b[1] + y, b[2] + z))
            faces += [tuple(n + i for i in face) for face in FACES]
            k.emit(verts, faces, mat, sharp=40)
            continue
        k.tube([f(root), f(stem), f(head)], 0.0065, mat, seg=6, smooth=2)
        if round_head:
            k.lathe([(0, -0.012), (w, -0.008), (w, 0.008), (w * 0.9, 0.014), (0, 0.014)], (b[0], b[1], b[2]), mat, axis="z", seg=18)
            k.cylinder(w * 0.88, 0.002, (b[0], b[1], b[2] - 0.013), "chrome", axis="z", seg=18)
        else:
            k.loft([(b[2] - 0.016, b[1] - h * 0.5, b[1] + h * 0.5, w * 0.45, 2.4, 2.4, 0.5, 1, 1, b[0]),
                    (b[2] - 0.006, b[1] - h, b[1] + h, w, 3, 3, 0.5, 1, 1, b[0] + side * 0.01),
                    (b[2] + 0.012, b[1] - h * 0.9, b[1] + h * 0.9, w * 0.92, 3, 3, 0.5, 1, 1, b[0] + side * 0.01),
                    (b[2] + 0.022, b[1] - h * 0.4, b[1] + h * 0.4, w * 0.35, 2.4, 2.4, 0.5, 1, 1, b[0])],
                   mat, ring=12, steps=1)
            k.box((w * 1.7, h * 1.7, 0.002), (b[0] + side * 0.01, b[1], b[2] - 0.017), "chrome", bevel=0)


def tapered_beam(k, a, b, size_a, size_b, mat, bevel=0.008):
    """A box-section bar from a to b, (across, deep) `size_a` at a narrowing to `size_b` at b; across stays level."""
    a, b = Vector(a), Vector(b)
    along = (b - a).normalized()
    across = Vector((0, 1, 0)).cross(along)
    across = across.normalized() if across.length > 1e-4 else Vector((1, 0, 0))
    deep = along.cross(across)
    verts = []
    for end, (sx, sy) in ((a, size_a), (b, size_b)):
        for y in (-sy / 2, sy / 2):
            for x in (-sx / 2, sx / 2):
                verts.append(tuple(end + across * x + deep * y))
    return k.emit(verts, FACES, mat, bevel=0 if k.low else bevel)


def prism(k, a, b, shape, mat, cap=None, scale_b=1.0):
    """A bar swept straight from a to b with the cross-section `shape`: (side,
    up) points, side toward +x, up toward +y, scaled by `scale_b` at b. `cap`
    finishes the b end with a rim and a recessed face."""
    a, b = Vector(a), Vector(b)
    along = (b - a).normalized()
    side = Vector((1, 0, 0))
    side = (side - along * side.dot(along)).normalized()
    up = along.cross(side)
    if up.y < 0:
        up = -up
    n = len(shape)
    verts = [tuple(end + (side * s + up * u) * f) for end, f in ((a, 1.0), (b, scale_b)) for s, u in shape]
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, j + n, i + n))
    k.emit(verts, faces, mat, sharp=50)
    if cap and not k.low:
        sh = [(s * scale_b, u * scale_b) for s, u in shape]
        inner = [(s * 0.78, u * 0.78) for s, u in sh]
        ring = [tuple(b + side * s + up * u) for s, u in sh] + [tuple(b + along * 0.012 + side * s + up * u) for s, u in sh] + \
               [tuple(b + along * 0.012 + side * s + up * u) for s, u in inner] + [tuple(b + along * 0.004 + side * s + up * u) for s, u in inner]
        cf = []
        for r in range(3):
            for i in range(n):
                j = (i + 1) % n
                cf.append((r * n + i, r * n + j, (r + 1) * n + j, (r + 1) * n + i))
        cf.append(tuple(range(3 * n, 4 * n))[::-1])
        k.emit(ring, cf, cap, sharp=50)


def _sweep_rings(path, half_up, half_deep, power=2.6, seg=16, swell=None):
    """Rings round a path lying in the x-y plane: each ring's height is along
    the path's in-plane normal, its depth along z (fore and aft)."""
    pts = [Vector(p) for p in path]
    rings = []
    for i, c in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        n = Vector((0, 0, 1)).cross(t).normalized()
        if n.y < 0:
            n = -n
        f = swell(i / (len(pts) - 1)) if swell else 1.0
        ring = []
        for k in range(seg):
            a = 2 * math.pi * (k + 0.5) / seg
            cs, sn = math.cos(a), math.sin(a)
            u = math.copysign(abs(sn) ** (2 / power), sn) * half_up * f
            v = math.copysign(abs(cs) ** (2 / power), cs) * half_deep * f
            ring.append(tuple(c + n * u + Vector((0, 0, v))))
        rings.append(ring)
    return rings


def _skin(k, rings, mat, cap=True, **kw):
    seg = len(rings[0])
    verts = [p for ring in rings for p in ring]
    faces = []
    for i in range(len(rings) - 1):
        for j in range(seg):
            a, b = i * seg + j, i * seg + (j + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    if cap:
        faces.append(tuple(range(seg)))
        faces.append(tuple(range(len(verts) - seg, len(verts))))
    return k.emit(verts, faces, mat, **kw)


def duffel(k, path, half_up, half_deep, mat="bag", strap="trim", buckle="steel_dark", straps=(0.3, 0.7), power=2.6, pocket=None, patch=None,
           anchors=()):
    """A soft dry bag lying along `path` (points in the x-y plane at one z):
    a squarish section that swells in the middle and gathers at the ends,
    rolled-down closures with clips at both ends, webbing straps round it at
    the fractions `straps`, an optional zip pocket and a plain round patch on
    its back face (`pocket`, `patch`: fractions along the path), and
    tie-down straps to `anchors`."""
    seg = 10 if k.low else 20
    swell = lambda u: 0.72 + 0.28 * math.sin(math.pi * min(1.0, max(0.0, u))) ** 0.5  # noqa: E731
    from bike_kit import spline
    smooth = [Vector(p) for p in spline([tuple(p) for p in path], 2 if k.low else 4)]
    rings = _sweep_rings(smooth, half_up, half_deep, power, seg, swell)
    _skin(k, rings, mat, sharp=60)
    z = smooth[0].z

    def at(u):
        f = u * (len(smooth) - 1)
        i = min(int(f), len(smooth) - 2)
        return smooth[i].lerp(smooth[i + 1], f - i), (smooth[i + 1] - smooth[i]).normalized()

    for end, sign in ((smooth[0], -1), (smooth[-1], 1)):
        t = (smooth[-1] - smooth[-2]).normalized() if sign > 0 else (smooth[0] - smooth[1]).normalized()
        # The roll-top folded flat past the end, and its side-release clip
        c = end + t * 0.025
        obox(k, c, (t, Vector((0, 0, 1)).cross(t).normalized() * (1 if Vector((0, 0, 1)).cross(t).y >= 0 else -1), Vector((0, 0, 1))),
             (0.045, half_up * 1.1, half_deep * 1.5), mat, bevel=0 if k.low else 0.012)
        if not k.low:
            obox(k, end + t * 0.05, (t, Vector((0, 1, 0)), Vector((0, 0, 1))), (0.012, 0.035, 0.025), buckle, bevel=0.003)
    if not k.low:
        for u in straps:
            c, t = at(u)
            band = _sweep_rings([c - t * 0.013, c + t * 0.013], half_up * swell(u) + 0.006, half_deep * swell(u) + 0.006, power, seg)
            _skin(k, band, strap, sharp=60)
            n = Vector((0, 0, 1)).cross(t).normalized()
            if n.y < 0:
                n = -n
            obox(k, c + n * (half_up * swell(u) + 0.008) + Vector((0, 0, -half_deep * 0.4)), (t, n, Vector((0, 0, 1))), (0.04, 0.012, 0.035), buckle, bevel=0.003)
        back = Vector((0, 0, -1))
        if pocket:
            c, t = at(pocket[0])
            w = half_deep * swell(pocket[0]) * (1.0 if power < 4 else 1.0)
            face = c + back * (w * 0.97)
            obox(k, face, (t, Vector((0, 0, 1)).cross(t).normalized(), Vector((0, 0, 1))), (pocket[1], half_up * 0.9, 0.012), mat, bevel=0.006)
            obox(k, face + back * 0.007 + Vector((0, half_up * 0.3, 0)), (t, Vector((0, 1, 0)), Vector((0, 0, 1))), (pocket[1] * 0.85, 0.008, 0.004), "alu", bevel=0)
        if patch:
            c, t = at(patch)
            face = c + back * (half_deep * swell(patch) * 0.97 + 0.008)
            k.lathe([(0, 0), (0.04, 0), (0.04, 0.003), (0, 0.003)], tuple(face + Vector((0, -half_up * 0.25, 0))), "patch", axis="z", rot=(math.pi, 0, 0), seg=16)
        for a, b in anchors:
            k.beam(a, b, (0.025, 0.004), strap, bevel=0)
    return z


def handlebar(k, grip, clamp, rise=0.06, sweep=0.04, radius=0.0125, mat="dark_metal", guards=None, risers=True, levers="dark_metal"):
    """A one-piece bar from the clamps out to the grips, with grips, bar ends,
    levers, master cylinders and switchgear. `guards` (a finish) adds plastic hand guards."""
    cy, cz = clamp
    for side in (-1, 1):
        g = Vector((side * grip[0], grip[1], grip[2]))
        bend = Vector((side * grip[0] * 0.45, cy + rise, cz - sweep * 0.3))
        k.tube([(0, cy + rise * 0.6, cz), (side * 0.06, cy + rise * 0.75, cz), tuple(bend), tuple(g - Vector((side * 0.08, 0, 0))), tuple(g + Vector((side * 0.065, 0, 0)))],
               radius, mat, seg=6 if k.low else 10, smooth=3)
        out = (g - bend).normalized()
        ahead = Vector((0, -0.15, 1)).normalized()
        k.rod(tuple(g - out * 0.065), tuple(g + out * 0.065), 0.0175, "rubber", seg=8 if k.low else 14)
        k.rod(tuple(g + out * 0.065), tuple(g + out * 0.085), 0.019, "dark_metal", seg=10)
        if not k.low:
            # Switch housing, the lever perch and the lever
            k.box((0.045, 0.04, 0.05), tuple(g - out * 0.1 + ahead * 0.005), "dark_metal", bevel=0.008)
            k.tube([tuple(g - out * 0.1 + ahead * 0.03), tuple(g - out * 0.03 + ahead * 0.075), tuple(g + out * 0.07 + ahead * 0.068)], 0.0055, levers, seg=6, smooth=2)
            if side > 0:
                k.cylinder(0.016, 0.034, tuple(g - out * 0.13 + Vector((0, 0.035, 0.0))), "dark_metal", seg=10)
            else:
                k.box((0.04, 0.03, 0.03), tuple(g - out * 0.13 + Vector((0, 0.01, 0.01))), "dark_metal", bevel=0.006)
        if guards:
            # A shell round the lever from the bar's root out to the bar end
            root = g - out * 0.14
            pts = []
            for t in range(5):
                u = t / 4
                p = root + out * (0.24 * u) + ahead * (0.045 + 0.075 * math.sin(math.pi * min(1.0, u * 1.1)))
                pts.append(p)
            k.tube([tuple(p) for p in pts], 0.012, guards, seg=6, smooth=2)
            if not k.low:
                # The deflector: a sheet hung from the bar in front of the lever
                def shell(u, v, root=root, out=out, ahead=ahead):
                    p = root + out * (0.2 * u + 0.02) + ahead * (0.05 + 0.07 * math.sin(math.pi * u)) + Vector((0, -0.05 + 0.1 * v, 0))
                    return tuple(p)
                k.sheet(shell, guards, nu=5, nv=2, thick=0.004)
        if risers:
            k.cylinder(0.017, 0.06, (side * 0.045, cy + 0.02, cz), "dark_metal", seg=10)


def chain_drive(k, x, front, rear, front_r, rear_r, mat="dark_metal", sprocket=True):
    """Chain runs round a front sprocket at `front` (y, z) and a rear one at
    `rear`; the rear sprocket too unless `sprocket` is False (it then belongs to the turning wheel)."""
    for sign in (1, -1):
        k.beam((x, front[0] + sign * front_r, front[1]), (x, rear[0] + sign * rear_r * 0.98, rear[1]), (0.014, 0.012), mat, bevel=0)
    teeth = lambda i, j: 0.006 if (j in (1, 2) and i % 2) else 0.0  # noqa: E731
    if sprocket:
        k.lathe([(0, -0.005), (rear_r, -0.005), (rear_r, 0.005), (0, 0.005)], (x, rear[0], rear[1]), "steel_dark", axis="x", seg=16 if k.low else 44, ripple=None if k.low else teeth, sharp=20)
    k.lathe([(0, -0.006), (front_r, -0.006), (front_r, 0.006), (0, 0.006)], (x, front[0], front[1]), "steel_dark", axis="x", seg=10 if k.low else 16)
    if not k.low:
        # The chain wrapped round the rear sprocket's back half
        k.lathe([(rear_r + 0.002, -0.007), (rear_r + 0.008, -0.007), (rear_r + 0.008, 0.007), (rear_r + 0.002, 0.007)], (x, rear[0], rear[1]), mat, axis="x", seg=16,
                arc=(math.pi * 0.5, math.pi * 1.5))


def plate(k, centre, size=(0.2, 0.15), tilt=0.15):
    """A blank number plate facing back."""
    k.box((size[0], size[1], 0.006), centre, "plate", rot=(tilt, 0, 0), bevel=0)
    if not k.low:
        k.box((size[0] + 0.012, size[1] + 0.012, 0.004), (centre[0], centre[1], centre[2] + 0.004), "dark_metal", rot=(tilt, 0, 0), bevel=0)


# ---------------------------------------------------------------- output


def _read(path):
    data = open(path, "rb").read()
    length = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + length])
    blen = struct.unpack_from("<I", data, 20 + length)[0]
    blob = data[20 + length + 8:20 + length + 8 + blen]
    return doc, blob


def merge(levels, out):
    """One glb from several kit exports: [(root name, path)], the roots in the order given."""
    doc = {"asset": {"version": "2.0", "generator": "twisty bikes group B"}, "scene": 0, "scenes": [{"nodes": []}],
           "nodes": [], "meshes": [], "materials": [], "accessors": [], "bufferViews": []}
    blob = b""
    used, required = set(), set()
    material_index = {}
    roots = []
    for name, path in levels:
        part, data = _read(path)
        base = len(blob)
        blob += data + b"\0" * (-len(data) % 4)
        views = len(doc["bufferViews"])
        accessors = len(doc["accessors"])
        meshes = len(doc["meshes"])
        nodes = len(doc["nodes"])
        for view in part["bufferViews"]:
            view = dict(view)
            view["byteOffset"] = view.get("byteOffset", 0) + base
            doc["bufferViews"].append(view)
        for accessor in part["accessors"]:
            accessor = dict(accessor)
            accessor["bufferView"] += views
            doc["accessors"].append(accessor)
        remap = []
        for material in part.get("materials", []):
            if material["name"] not in material_index:
                material_index[material["name"]] = len(doc["materials"])
                doc["materials"].append(material)
            remap.append(material_index[material["name"]])
        for mesh in part["meshes"]:
            for primitive in mesh["primitives"]:
                primitive["attributes"] = {key: value + accessors for key, value in primitive["attributes"].items()}
                if "indices" in primitive:
                    primitive["indices"] += accessors
                if "material" in primitive:
                    primitive["material"] = remap[primitive["material"]]
            doc["meshes"].append(mesh)
        for node in part["nodes"]:
            if "mesh" in node:
                node["mesh"] += meshes
            if "children" in node:
                node["children"] = [c + nodes for c in node["children"]]
            doc["nodes"].append(node)
        roots.append({"name": name, "children": [n + nodes for n in part["scenes"][part.get("scene", 0)]["nodes"]]})
        used |= set(part.get("extensionsUsed", []))
        required |= set(part.get("extensionsRequired", []))
    for root in roots:
        doc["scenes"][0]["nodes"].append(len(doc["nodes"]))
        doc["nodes"].append(root)
    if used:
        doc["extensionsUsed"] = sorted(used)
    if required:
        doc["extensionsRequired"] = sorted(required)
    doc["buffers"] = [{"byteLength": len(blob)}]
    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    body = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(blob))
    body += struct.pack("<II", len(text), 0x4E4F534A) + text + struct.pack("<II", len(blob), 0x004E4942) + blob
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "wb").write(body)
    return len(body)


def triangles(path):
    """Triangles of each node in a kit export, by name."""
    doc, _ = _read(path)
    counts = {}
    for node in doc["nodes"]:
        if "mesh" in node:
            counts[node["name"]] = sum(doc["accessors"][p["indices"]]["count"] // 3 for p in doc["meshes"][node["mesh"]]["primitives"])
    return counts


def make(name, build, colours=None, anchors=None, seed=11, alone=("wheel_front", "wheel_rear", "disc_front", "disc_rear"), low_decimate=None):
    """Builds the bike at both levels of detail into assets/bikes/detail/<name>.glb and checks the budgets."""
    tmp = os.environ.get("TWISTY_TMP") or os.path.join(bpy.app.tempdir or "/tmp", "twisty-bikes-B")
    os.makedirs(tmp, exist_ok=True)
    paths = {}
    counts = {}
    kits = {}
    for level, low in (("lod1", True), ("lod0", False)):
        k = Kit(seed=seed, colours=colours, low=low)
        build(k)
        path = os.path.join(tmp, f"{name}-{level}.glb")
        k.finish(path, anchors=anchors, alone=alone, decimate=low_decimate if low else None)
        paths[level] = path
        counts[level] = triangles(path)
        kits[level] = k
        preview(k, f"{name}-{level}")
    if set(counts["lod0"]) != set(counts["lod1"]):
        raise SystemExit(f"{name}: the levels hold different nodes: {sorted(counts['lod0'])} against {sorted(counts['lod1'])}")
    out = os.path.join(OUT_DIR, f"{name}.glb")
    size = merge([("lod1", paths["lod1"]), ("lod0", paths["lod0"])], out)
    total = {level: sum(c.values()) for level, c in counts.items()}
    print(f"{name}.glb: lod0 {total['lod0']} triangles, lod1 {total['lod1']} triangles, {size} bytes")
    print("  lod0", counts["lod0"])
    print("  lod1", counts["lod1"])
    report = os.environ.get("TWISTY_REPORT")
    if report:
        with open(report, "a") as f:
            f.write(json.dumps({"name": name, "lod0": total["lod0"], "lod1": total["lod1"], "bytes": size, "nodes": counts}) + "\n")
    if total["lod0"] > LOD0_BUDGET or total["lod1"] > LOD1_BUDGET or size > SIZE_BUDGET:
        raise SystemExit(f"{name}: over budget (lod0 {total['lod0']}/{LOD0_BUDGET}, lod1 {total['lod1']}/{LOD1_BUDGET}, {size}/{SIZE_BUDGET} bytes)")
    return kits["lod0"]


def preview(k, name):
    """With TWISTY_PREVIEW set to a directory, renders the model there from both sides, front and rear three-quarter."""
    out = os.environ.get("TWISTY_PREVIEW")
    if not out:
        return
    only = os.environ.get("TWISTY_VIEWS")
    views = {
        "right": ((5.2, 0.75, 0.0), (0, 0.62, 0.0), 58),
        "left": ((-5.2, 0.75, 0.0), (0, 0.62, 0.0), 58),
        "front34": ((2.6, 1.45, 3.6), (0, 0.6, 0.05), 55),
        "rear34": ((-2.6, 1.45, -3.6), (0, 0.6, -0.05), 55),
    }
    if "lod1" in name:
        views = {key: views[key] for key in ("right", "front34")}
    for view, (eye, target, lens) in views.items():
        if only and view not in only.split(","):
            continue
        render(k.scene, os.path.join(out, f"{name}-{view}.png"), eye, target, lens=lens)
