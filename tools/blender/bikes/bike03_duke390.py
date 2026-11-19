# Bike 03: a c. 2016 small-capacity single-cylinder naked, on the 2018 and
# 2019 trips. Black bodywork with white-outlined graphics and orange slashes
# on the tank shrouds, a black and white headlight mask round one upright
# lamp under a small tinted fly screen, an orange steel trellis frame, orange
# ten-spoke wheels, upside-down forks with black outer tubes, one radial
# caliper on a single front disc, a silver cast subframe, a black swingarm
# with a white-sprung shock beside it, an underbelly silencer with orange and
# white stripes, and a short tail on a trimmed plate hanger.
#
# Real dimensions: wheelbase 1367 mm, seat 800 mm, rake 25 degrees,
# 110/70-17 and 150/60-17 tyres, 300 mm front and 230 mm rear discs.
#   blender --background --factory-startup --python tools/blender/bikes/bike03_duke390.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_a as A  # noqa: E402
from _kit_a import Vector  # noqa: E402

FRONT, REAR = (0, 0.293, 0.6835), (0, 0.306, -0.6835)
RAKE = math.radians(25)
FORK_LEN = 0.7
TOP = (FRONT[1] + math.cos(RAKE) * FORK_LEN, FRONT[2] - math.sin(RAKE) * FORK_LEN)
GRIP = (0.31, 1.03, 0.32)
PEG = (0.19, 0.37, -0.15)
SEAT = (0, 0.8, -0.16)
PIVOT = (0.42, -0.12)
ORANGE = 0xF26A10
BLACK = 0x111214


def build(k):
    L1 = k.lod == 1

    # --- Wheels: orange, ten slim spokes in pairs
    for node, c, radius, width in (("wheel_rear", REAR, 0.306, 0.15), ("wheel_front", FRONT, 0.293, 0.11)):
        k.begin(node, c)
        A.tyre(k, c, radius, width, 0.216)
        A.rim_barrel(k, c, width, 0.216, mat="accent")
        A.spokes(k, c, 0.216, 0.048, count=5, style="twin", mat="accent", width=0.026, spread=0.24)
        A.hub(k, c, width, radius=0.048, mat="accent")
    k.begin("wheel_rear")
    k.lathe([(0, -0.004), (0.094, -0.004), (0.094, 0.004), (0, 0.004)], (-0.09, REAR[1], REAR[2]), "steel_dark", axis="x", seg=k.q(40, 14),
            ripple=(lambda i, j: 0.006 if (j in (1, 2) and i % 2) else 0.0) if not L1 else None, sharp=20)

    k.begin("disc_rear", REAR)
    A.disc(k, (0.066, REAR[1], REAR[2]), 0.115, style="round", carrier="steel_dark", arms=5, inner=0.62)
    k.begin("disc_front", FRONT)
    A.disc(k, (0.058, FRONT[1], FRONT[2]), 0.15, style="round", carrier="steel_dark", arms=6)

    # --- Forks: upside-down, black outer tubes, bright stanchions, one radial caliper on the right
    A.fork_pair(k, x=0.095, axle=(FRONT[1], FRONT[2]), top=TOP, pivot=(0.095, 0.62, 0.55), usd=True, r_tube=0.02,
                outer_mat="anodised", inner_mat="chrome", foot_mat="dark_metal", cap_mat="accent", adjust_mat=None,
                calipers=(1,), disc_x=0.058, disc_r=0.15, caliper_mat="caliper", caliper_angle=165, caliper_size=1.0, split=0.4)

    # --- Handlebar: a black tapered bar, black levers, mirrors on long stalks
    k.begin("handlebar", (0, 1.0, 0.36))
    clamp = Vector((0, 0.995, 0.37))
    for side in (-1, 1):
        g = Vector((side * GRIP[0], GRIP[1], GRIP[2]))
        bend = Vector((side * 0.13, 1.005, 0.36))
        k.tube([clamp, clamp + Vector((side * 0.06, 0, 0)), bend, g - Vector((side * 0.08, 0, -0.008)), g + Vector((side * 0.07, 0, 0))],
               [0.014, 0.014, 0.013, 0.0115, 0.0115], "dark_metal", seg=k.q(10, 6), smooth=2)
        A.bar_controls(k, g, bend, side, lever_mat="steel", housing="dark_metal")
        k.cylinder(0.018, 0.04, (side * 0.05, 0.975, 0.375), "dark_metal", seg=k.q(10, 6))
        root = Vector((side * 0.19, 1.02, 0.345))
        head = Vector((side * 0.28, 1.21, 0.33))
        k.tube([root, root + Vector((side * 0.015, 0.08, 0.0)), head], 0.0065, "dark_metal", seg=k.q(6, 4), smooth=2)
        k.loft([(head.z - 0.012, head.y - 0.025, head.y + 0.03, 0.03, 2.6, 2.6, 0.5, 1, 1, head.x + side * 0.02),
                (head.z - 0.004, head.y - 0.035, head.y + 0.042, 0.065, 3.2, 3.2, 0.5, 0.85, 0.9, head.x + side * 0.04),
                (head.z + 0.012, head.y - 0.033, head.y + 0.04, 0.064, 3.2, 3.2, 0.5, 0.85, 0.9, head.x + side * 0.04),
                (head.z + 0.02, head.y - 0.015, head.y + 0.02, 0.03, 2.6, 2.6, 0.5, 1, 1, head.x + side * 0.03)],
               "dark_metal", ring=k.q(12, 6), steps=1, sharp=40)

    # --- Brake light: a wide LED lens under the tail's tip
    k.begin("brake_light", (0, 0.9, -0.79))
    k.box((0.12, 0.03, 0.026), (0, 0.9, -0.795), "brake", rot=(0.5, 0, 0), bevel=0.008)

    # --- Headlight: one upright lamp, a little taller than wide
    k.begin("headlight", (0, 0.84, 0.66))
    k.loft([(0.635, 0.775, 0.905, 0.05, 2.2, 2.2), (0.65, 0.77, 0.91, 0.056, 2.2, 2.2), (0.658, 0.785, 0.895, 0.045, 2.2, 2.2), (0.66, 0.8, 0.88, 0.03)],
           "chrome", ring=k.q(20, 10), steps=1)
    k.loft([(0.655, 0.795, 0.885, 0.034, 2.2, 2.2), (0.664, 0.8, 0.88, 0.03, 2.2, 2.2), (0.668, 0.812, 0.868, 0.018)], "headlight", ring=k.q(18, 8), steps=1)
    if not L1:
        k.box((0.012, 0.09, 0.008), (0.05, 0.85, 0.655), "lens", rot=(-0.2, 0, 0), bevel=0.002)

    k.begin("body")
    body(k)


def body(k):
    L1 = k.lod == 1

    stem, axis, back = A.yokes(k, 0.095, (FRONT[1], FRONT[2]), TOP, 0.028, offset=0.032, mat="dark_metal", lower_t=0.78)
    head_a = Vector((0, FRONT[1], FRONT[2])) + Vector((0, axis.y, axis.z)) * FORK_LEN * 0.76 + back * 0.032
    head_b = Vector((0, FRONT[1], FRONT[2])) + Vector((0, axis.y, axis.z)) * FORK_LEN * 0.98 + back * 0.032
    k.rod(tuple(head_a), tuple(head_b), 0.03, "accent", seg=k.q(14, 8))

    # Headlight mask: angular, a pointed chin under the lamp, a swept wing
    # down each side with a white streak, a tinted fly screen over it, the dash behind
    k.loft([(0.5, 0.78, 0.93, 0.085, 6, 6, 0.5, 0.7, 0.55),
            (0.56, 0.755, 0.945, 0.105, 6, 6, 0.5, 0.62, 0.45),
            (0.61, 0.735, 0.935, 0.1, 6, 6, 0.55, 0.58, 0.35),
            (0.645, 0.745, 0.915, 0.08, 6, 5, 0.55, 0.55, 0.3)],
           "paint", ring=k.q(12, 8), steps=k.q(2, 1), sharp=15)
    for side in (-1, 1):
        k.panel([(0.655, 0.905), (0.61, 0.94), (0.47, 0.9), (0.46, 0.84), (0.55, 0.77), (0.64, 0.75)], side * 0.11, 0.012, "paint", toe=-side * 0.38, bevel=0.003)
        k.panel([(0.64, 0.89), (0.6, 0.915), (0.5, 0.885), (0.51, 0.87), (0.6, 0.895), (0.635, 0.875)], side * 0.118, 0.004, "plastic", toe=-side * 0.38, bevel=0)
        k.panel([(0.63, 0.79), (0.56, 0.8), (0.49, 0.85), (0.5, 0.86), (0.56, 0.815), (0.63, 0.805)], side * 0.118, 0.004, "plastic", toe=-side * 0.38, bevel=0)

    def screen(u, v):
        across = (v - 0.5) * 2
        half = 0.09 - 0.03 * u
        return (across * half, 0.925 + 0.14 * u + 0.01 * (1 - across * across), 0.64 - 0.08 * u - 0.03 * across * across)

    k.sheet(screen, "glass", nu=k.q(4, 2), nv=k.q(6, 3), thick=0.005)
    k.box((0.12, 0.08, 0.03), (0, 0.98, 0.5), "dark_metal", rot=(0.9, 0, 0), bevel=0.008)
    k.box((0.095, 0.06, 0.006), (0, 0.992, 0.488), "dash", rot=(0.9, 0, 0), bevel=0)
    # Front indicators on stalks below the mask
    for side in (-1, 1):
        k.rod((side * 0.07, 0.76, 0.6), (side * 0.13, 0.755, 0.62), 0.006, "dark_metal", seg=6)
        k.loft([(0.6, 0.745, 0.765, 0.012, 2.4, 2.4, 0.5, 1, 1, side * 0.14), (0.625, 0.742, 0.768, 0.016, 2.4, 2.4, 0.5, 1, 1, side * 0.143),
                (0.645, 0.748, 0.762, 0.01, 2.4, 2.4, 0.5, 1, 1, side * 0.146)], "signal", ring=k.q(10, 6), steps=1)

    # Tank: compact and tall at the front, black
    k.loft([(0.42, 0.86, 0.94, 0.07, 3.2, 3),
            (0.38, 0.8, 0.98, 0.14, 3.2, 3.2, 0.55, 0.7, 0.9),
            (0.27, 0.77, 0.995, 0.165, 3.2, 3.2, 0.55, 0.68, 0.86),
            (0.13, 0.76, 0.985, 0.165, 3.2, 3.2, 0.55, 0.66, 0.84),
            (0.02, 0.77, 0.95, 0.14, 3.0, 3.0, 0.55, 0.7, 0.8),
            (-0.05, 0.79, 0.9, 0.1, 3, 2.8),
            (-0.08, 0.8, 0.86, 0.06)],
           "paint", ring=k.q(24, 12), steps=k.q(3, 1), sharp=30)
    k.cylinder(0.042, 0.01, (0, 0.995, 0.22), "steel_dark", seg=k.q(16, 8))

    # Tank shrouds: big angular black wings with white-outlined blocks and orange slashes
    toe = 0.16
    for side in (-1, 1):
        x = side * (0.16 + 0.42 * math.sin(toe))
        out = [(0.4, 0.93), (0.5, 0.9), (0.6, 0.82), (0.6, 0.72), (0.52, 0.62), (0.38, 0.58), (0.26, 0.64), (0.26, 0.8)]
        k.panel(out, x, 0.022, "paint", toe=-side * toe, bevel=0.007)
        o = x + side * 0.0125
        if not L1:
            # Two outlined blocks: thin white frames standing proud of the panel
            for z0, z1 in ((0.33, 0.45),):
                for a, b in (((z0, 0.66), (z1, 0.7)), ((z1, 0.7), (z1 + 0.03, 0.84)), ((z1 + 0.03, 0.84), (z0 + 0.03, 0.8)), ((z0 + 0.03, 0.8), (z0, 0.66))):
                    dz, dy = b[0] - a[0], b[1] - a[1]
                    n = math.hypot(dz, dy)
                    w = 0.006
                    ny, nz = dz / n * w, -dy / n * w
                    k.panel([a, b, (b[0] + nz, b[1] + ny), (a[0] + nz, a[1] + ny)], o, 0.003, "plastic", toe=-side * toe, bevel=0)
        k.panel([(0.58, 0.79), (0.585, 0.77), (0.33, 0.62), (0.31, 0.64)], o + side * 0.001, 0.003, "accent", toe=-side * toe, bevel=0)
        k.panel([(0.56, 0.74), (0.565, 0.725), (0.44, 0.64), (0.43, 0.655)], o + side * 0.001, 0.003, "plastic", toe=-side * toe, bevel=0)
        # White streak along the shroud's top edge at the front
        k.panel([(0.42, 0.915), (0.5, 0.885), (0.58, 0.815), (0.57, 0.805), (0.49, 0.872), (0.41, 0.9)], o, 0.003, "plastic", toe=-side * toe, bevel=0)

    # Radiator in front of the cylinder, a louvred guard
    rad = A.Matrix.Translation(Vector((0, 0.58, 0.36))) @ A.euler(-0.2, 0, 0)
    k.fbox(rad, (0.26, 0.26, 0.04), (0, 0, 0), "dark_metal", bevel=0.006)
    k.fbox(rad, (0.24, 0.24, 0.004), (0, 0, 0.021), "vent", bevel=0)
    if not L1:
        for n in range(7):
            k.fbox(rad, (0.24, 0.004, 0.012), (0, -0.1 + n * 0.033, 0.027), "dark_metal", bevel=0)

    # Seat, and the pillion pad on the tail
    k.loft([(0.0, 0.775, 0.81, 0.09, 3, 3), (-0.06, 0.775, 0.805, 0.14, 3, 3), (-0.2, 0.775, 0.8, 0.14, 3.2, 3), (-0.32, 0.78, 0.82, 0.12, 3, 3),
            (-0.38, 0.8, 0.84, 0.08)], "seat", ring=k.q(16, 8), steps=k.q(2, 1))
    k.loft([(-0.38, 0.84, 0.87, 0.06, 3, 3), (-0.43, 0.84, 0.89, 0.09, 3, 3), (-0.6, 0.87, 0.91, 0.075, 3, 3), (-0.66, 0.885, 0.915, 0.045)],
           "seat", ring=k.q(14, 8), steps=k.q(2, 1))

    # Tail: black side panels sweeping up to a point, a white stripe along the lower edge
    def tail(u, up, side):
        if 0.15 < u < 0.85 and -0.62 < up < -0.48 and abs(side) > 0.45:
            return "plastic"
        return "paint"

    k.loft([(-0.02, 0.66, 0.79, 0.12, 3, 2.6),
            (-0.16, 0.68, 0.81, 0.14, 3, 2.6),
            (-0.36, 0.73, 0.86, 0.125, 3, 2.6),
            (-0.56, 0.8, 0.9, 0.095, 3, 2.6),
            (-0.72, 0.86, 0.92, 0.065, 3, 2.6),
            (-0.8, 0.88, 0.915, 0.035)],
           tail, ring=k.q(18, 10), steps=k.q(3, 1), sharp=35)
    k.loft([(-0.36, 0.7, 0.75, 0.08), (-0.58, 0.77, 0.82, 0.065), (-0.76, 0.83, 0.86, 0.045)], "dark_metal", ring=k.q(10, 6), steps=1)
    # Trimmed plate hanger, plate, indicators, reflector
    k.loft([(-0.74, 0.8, 0.84, 0.045), (-0.84, 0.72, 0.76, 0.04), (-0.9, 0.66, 0.7, 0.035)], "dark_metal", ring=k.q(10, 6), steps=k.q(2, 1))
    k.box((0.18, 0.12, 0.006), (0, 0.6, -0.925), "plate", rot=(0.3, 0, 0), bevel=0)
    k.box((0.19, 0.13, 0.008), (0, 0.6, -0.92), "dark_metal", rot=(0.3, 0, 0), bevel=0.003)
    k.box((0.06, 0.02, 0.006), (0, 0.67, -0.9), "reflector", rot=(0.3, 0, 0), bevel=0.002)
    for side in (-1, 1):
        k.rod((side * 0.03, 0.73, -0.84), (side * 0.11, 0.735, -0.845), 0.0065, "dark_metal", seg=6)
        k.loft([(-0.83, 0.723, 0.745, 0.012, 2.4, 2.4, 0.5, 1, 1, side * 0.12), (-0.855, 0.72, 0.748, 0.015, 2.4, 2.4, 0.5, 1, 1, side * 0.12),
                (-0.87, 0.727, 0.742, 0.009, 2.4, 2.4, 0.5, 1, 1, side * 0.12)], "signal", ring=k.q(10, 6), steps=1)
    k.guard((REAR[1], REAR[2]), 0.335, 0.15, math.radians(60), math.radians(125), "dark_metal", crown=0.03, nu=k.q(8, 4), nv=k.q(4, 2))
    k.panel([(-0.2, 0.47), (-0.5, 0.41), (-0.52, 0.39), (-0.2, 0.445)], -0.105, 0.006, "dark_metal", bevel=0.002)

    # Front mudguard
    k.guard((FRONT[1], FRONT[2]), 0.318, 0.12, math.radians(28), math.radians(132), "paint", crown=0.035, nu=k.q(10, 5), nv=k.q(5, 3))

    frame(k)
    engine(k)
    exhaust(k)
    rear_end(k)


def frame(k):
    # Orange trellis: a top rail and a lower rail from the headstock to the
    # pivot, braced in a run of triangles over the engine; a silver cast subframe
    head, headlo = (0.035, 0.88, 0.38), (0.04, 0.79, 0.42)
    top = [(0.11, 0.84, 0.24), (0.13, 0.78, 0.06), (0.135, 0.72, -0.08)]
    low = [(0.1, 0.66, 0.3), (0.12, 0.6, 0.14), (0.13, 0.56, -0.02)]
    pv = (0.13, 0.5, -0.1)
    r = 0.011
    for side in (-1, 1):
        S = lambda p: (side * p[0], p[1], p[2])
        k.tube([S(head)] + [S(p) for p in top], r, "accent", seg=k.q(9, 5), smooth=1)
        k.tube([S(headlo)] + [S(p) for p in low] + [S(pv)], r, "accent", seg=k.q(9, 5), smooth=1)
        for a, b in ((low[0], top[0]), (top[0], low[1]), (low[1], top[1]), (top[1], low[2]), (low[2], top[2]), (top[2], pv)):
            k.rod(S(a), S(b), r * 0.85, "accent", seg=k.q(8, 5))
        # Engine hangers down to the crankcase
        k.rod(S(low[0]), (side * 0.1, 0.48, 0.3), r * 0.85, "accent", seg=k.q(8, 5))
        k.panel([(-0.03, 0.58), (-0.16, 0.56), (-0.19, 0.4), (-0.15, 0.32), (-0.07, 0.31), (-0.02, 0.42)], side * 0.138, 0.018, "dark_metal", bevel=0.005)
        k.cylinder(0.02, 0.012, (side * 0.15, PIVOT[0], PIVOT[1]), "steel_dark", axis="x", seg=k.q(12, 6))
        # Cast subframe in silver, a broad web up to the tail
        k.panel([(-0.1, 0.71), (-0.3, 0.745), (-0.58, 0.81), (-0.6, 0.79), (-0.34, 0.71), (-0.16, 0.64), (-0.11, 0.65)], side * 0.112, 0.014, "frame_light", bevel=0.004)
    for a in (top[0], low[1], pv):
        k.rod((-a[0], a[1], a[2]), (a[0], a[1], a[2]), r * 0.85, "accent", seg=k.q(8, 5))


def engine(k):
    L1 = k.lod == 1
    seg = k.q(22, 10)
    # Single: crankcase, an upright cylinder leaning forward, head and cam cover
    k.loft([(0.25, 0.22, 0.46, 0.11, 3, 3), (0.2, 0.17, 0.5, 0.13, 3.2, 3.2), (0.0, 0.16, 0.52, 0.13, 3.2, 3.2), (-0.1, 0.2, 0.54, 0.12, 3, 3),
            (-0.15, 0.3, 0.52, 0.1, 3, 3), (-0.17, 0.38, 0.48, 0.07)], "dark_metal", ring=k.q(18, 10), steps=k.q(2, 1), sharp=35)
    cyl = A.Matrix.Translation(Vector((0, 0.53, 0.2))) @ A.euler(-0.3, 0, 0)
    k.fbox(cyl, (0.13, 0.16, 0.14), (0, 0, 0), "dark_metal", bevel=0.012)
    if not L1:
        for n in range(5):
            k.fbox(cyl, (0.136, 0.005, 0.142), (0, -0.065 + n * 0.03, 0), "steel_dark", bevel=0)
    k.fbox(cyl, (0.16, 0.08, 0.16), (0, 0.115, 0.0), "dark_metal", bevel=0.014)
    k.fbox(cyl, (0.15, 0.05, 0.14), (0, 0.17, 0.0), "steel_dark", bevel=0.018)
    # Covers: silver clutch on the right, silver alternator on the left
    k.lathe([(0, 0), (0.085, 0), (0.088, 0.012), (0.075, 0.03), (0.05, 0.036), (0, 0.038)], (0.13, 0.35, -0.02), "steel", axis="x", seg=seg)
    k.lathe([(0, 0), (0.07, 0), (0.072, 0.012), (0.058, 0.028), (0, 0.032)], (-0.13, 0.33, 0.06), "steel", axis="x", rot=(0, 0, math.pi), seg=seg)
    if not L1:
        k.lathe([(0, 0), (0.03, 0), (0.03, 0.006), (0, 0.006)], (0.168, 0.35, -0.02), "accent", axis="x", seg=12)
    k.box((0.03, 0.1, 0.12), (-0.125, 0.38, -0.08), "dark_metal", bevel=0.01)
    A.bolts(k, (0.166, 0.35, -0.02), 0.075, 9, 1, mat="steel_dark")
    A.bolts(k, (-0.16, 0.33, 0.06), 0.062, 7, -1, mat="steel_dark")
    A.cable(k, [(0.05, 0.99, 0.32), (0.08, 0.92, 0.41), (0.07, 0.8, 0.42), (0.09, 0.7, 0.28)])
    A.cable(k, [(-0.09, 0.99, 0.32), (-0.1, 0.9, 0.41), (-0.08, 0.78, 0.4), (-0.11, 0.6, 0.24)])
    k.box((0.16, 0.06, 0.22), (0, 0.17, 0.06), "dark_metal", bevel=0.012)
    # Airbox under the tank
    k.box((0.2, 0.12, 0.2), (0, 0.72, 0.06), "dark_metal", bevel=0.02)


def exhaust(k):
    # One header from the front of the head, down and under the engine into
    # the underbelly box; the box's black cover with orange and white stripes
    k.tube([(0.0, 0.62, 0.32), (0.01, 0.55, 0.38), (0.02, 0.4, 0.39), (0.03, 0.26, 0.33), (0.03, 0.16, 0.2), (0.02, 0.13, 0.05)], 0.02, "steel", seg=k.q(10, 6),
           smooth=k.q(3, 2))
    k.loft([(0.12, 0.1, 0.2, 0.06), (0.06, 0.09, 0.23, 0.1, 3.4, 3.4), (-0.12, 0.09, 0.24, 0.11, 3.4, 3.4), (-0.24, 0.11, 0.24, 0.1, 3.4, 3.4),
            (-0.28, 0.13, 0.23, 0.07)], "dark_metal", ring=k.q(16, 8), steps=k.q(2, 1))
    k.lathe([(0, 0), (0.026, 0), (0.03, 0.04), (0.03, 0.06), (0, 0.06)], (0.07, 0.15, -0.26), "steel", to=(0.13, 0.18, -0.33), seg=k.q(14, 8))
    for side in (-1, 1):
        k.panel([(0.14, 0.24), (0.08, 0.13), (-0.22, 0.14), (-0.27, 0.2), (-0.02, 0.25)], side * 0.115, 0.01, "paint", toe=side * -0.05, bevel=0.003)
        k.panel([(0.08, 0.2), (0.06, 0.185), (-0.18, 0.18), (-0.2, 0.195)], side * 0.122, 0.004, "accent", toe=side * -0.05, bevel=0)
        k.panel([(0.07, 0.172), (0.055, 0.162), (-0.16, 0.158), (-0.18, 0.168)], side * 0.122, 0.004, "plastic", toe=side * -0.05, bevel=0)


def rear_end(k):
    L1 = k.lod == 1
    # Black cast swingarm, deeper at the front, with a brace under it
    for side in (-1, 1):
        x = side * 0.095
        k.loft([(PIVOT[1] + 0.02, PIVOT[0] - 0.05, PIVOT[0] + 0.05, 0.018, 3, 3, 0.5, 1, 1, x),
                (PIVOT[1] - 0.15, PIVOT[0] - 0.07, PIVOT[0] + 0.03, 0.018, 3, 3, 0.5, 1, 1, x),
                (REAR[2] + 0.12, REAR[1] - 0.03, REAR[1] + 0.035, 0.016, 3, 3, 0.5, 1, 1, x),
                (REAR[2] - 0.03, REAR[1] - 0.025, REAR[1] + 0.025, 0.016, 3, 3, 0.5, 1, 1, x)],
               "dark_metal", ring=k.q(12, 6), steps=k.q(2, 1), sharp=35)
        k.box((0.036, 0.04, 0.05), (side * 0.108, REAR[1], REAR[2]), "steel_dark", bevel=0.006)
        k.cylinder(0.013, 0.012, (side * 0.125, REAR[1], REAR[2]), "steel", axis="x", seg=k.q(10, 6))
    k.box((0.17, 0.05, 0.08), (0, PIVOT[0] - 0.02, PIVOT[1] - 0.12), "dark_metal", bevel=0.012)
    k.rod((-0.15, PIVOT[0], PIVOT[1]), (0.15, PIVOT[0], PIVOT[1]), 0.015, "steel_dark", seg=k.q(10, 6))
    # White-sprung shock on the left, from the frame to the arm
    a, b = (-0.06, 0.7, -0.14), (-0.07, 0.43, -0.27)
    length = (Vector(b) - Vector(a)).length
    coils = 8
    k.lathe([(0.03 if n % 2 else 0.022, length * (0.18 + 0.64 * n / (coils * 2))) for n in range(coils * 2 + 1)], a, "plastic", to=b, seg=k.q(10, 6), sharp=80)
    k.rod(a, b, 0.015, "dark_metal", seg=k.q(8, 5))
    k.cylinder(0.024, 0.05, tuple(Vector(a) + (Vector(b) - Vector(a)) * 0.1), "accent", rot=(-0.45, 0, 0), seg=k.q(10, 6))
    # Chain on the left, the front sprocket
    A.chain(k, -0.09, (0.39, -0.04, 0.045), (REAR[1], REAR[2], 0.094))
    A.caliper(k, (REAR[1], REAR[2]), 0.115, 205, 0.066, mat="caliper", lug_mat="dark_metal", lug_to=(0.095, REAR[1] + 0.02, REAR[2] + 0.12), size=0.8)

    # Pegs on black hangers, the pillion pegs, the controls, the side stand
    for side in (-1, 1):
        x, y, z = side * PEG[0], PEG[1], PEG[2]
        k.rod((x - side * 0.07, y, z), (x + side * 0.05, y, z), 0.012, "rubber", seg=k.q(10, 6))
        k.panel([(z + 0.05, y + 0.03), (z + 0.0, y + 0.13), (z - 0.06, y + 0.12), (z - 0.04, y - 0.01), (z + 0.02, y - 0.025)], side * (PEG[0] - 0.07), 0.01, "dark_metal", bevel=0.003)
        px, py, pz = side * 0.18, 0.5, -0.4
        k.rod((px - side * 0.05, py, pz), (px + side * 0.04, py, pz), 0.011, "rubber", seg=k.q(8, 5))
        k.tube([(side * 0.115, 0.64, -0.32), (side * 0.14, 0.56, -0.38), (px - side * 0.04, py, pz)], 0.011, "frame_light", seg=k.q(8, 5))
    k.rod((-PEG[0] + 0.05, PEG[1] - 0.01, PEG[2] + 0.02), (-PEG[0] + 0.02, PEG[1] + 0.02, PEG[2] + 0.18), 0.007, "steel", seg=6)
    k.rod((PEG[0] - 0.05, PEG[1] - 0.01, PEG[2] + 0.02), (PEG[0] - 0.02, PEG[1] - 0.03, PEG[2] + 0.17), 0.007, "steel", seg=6)
    k.side_stand((-0.14, 0.28, -0.04), (-0.26, 0.06, 0.05), 0.011, "steel_dark", seg=k.q(8, 5))


def build_all(k):
    build(k)
    # Soft tail pack lying on the pillion, on both trips
    A.tail_pack(k, -0.7, -0.38, 0.885, 1.07, 0.15, straps=2)
    k.begin("body")


A.build(build_all, "bike03_duke390", seed=103,
        colours={"bag": 0x2B2D31, "paint": BLACK, "paint_dark": 0x060607, "accent": ORANGE, "caliper": 0x3A3D42, "frame_light": 0xA9ADB2},
        anchors={"grip": GRIP, "peg": PEG, "seat": SEAT},
        views={"match_e19_250": ((-2.5, 1.8, 1.4), (0, 0.6, 0.0), 50), "match_a18_047": ((1.9, 1.0, 2.1), (0, 0.65, 0.3), 36),
               "front": ((0.0, 0.95, 4.2), (0, 0.6, 0.2), 55), "rear": ((0.0, 1.1, -4.2), (0, 0.6, -0.2), 55)})
