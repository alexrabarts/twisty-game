# Bike 01: a 2020-generation middleweight naked parallel twin, as ridden on
# the 2022 trip. Mostly gloss black: a lime-green steel trellis frame, two
# thin lime lines on each shroud and along the headlight cowl, a lime line on
# the tank's lower edge and along the tail, a lime slash on the front
# mudguard, thin lime pinstripes on the black rims. Twin LED headlight in a
# sharp cowl under a small fly screen, conventional forks with black sliders,
# twin petal discs, bronze headers into an underslung silencer, a curved
# black swingarm and a short tail on a long plate hanger.
#
# Real dimensions: wheelbase 1410 mm, seat 790 mm, rake 24 degrees,
# 120/70-17 and 160/60-17 tyres, 300 mm front and 220 mm rear discs.
#   blender --background --factory-startup --python tools/blender/bikes/bike01_z650.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_a as A  # noqa: E402
from _kit_a import Vector  # noqa: E402

FRONT, REAR = (0, 0.300, 0.705), (0, 0.312, -0.705)
RAKE = math.radians(24)
FORK_AXIS = (math.cos(RAKE), -math.sin(RAKE))
FORK_LEN = 0.70
TOP = (FRONT[1] + FORK_AXIS[0] * FORK_LEN, FRONT[2] + FORK_AXIS[1] * FORK_LEN)
GRIP = (0.31, 1.0, 0.33)
PEG = (0.2, 0.37, -0.15)
SEAT = (0, 0.79, -0.17)
PIVOT = (0.4, -0.13)
LIME = 0x8FC21B
BLACK = 0x0E0F12


def build(k):
    L1 = k.lod == 1

    # --- Wheels: black five split-spoke rims, a thin lime pinstripe each side
    for node, c, radius, width in (("wheel_rear", REAR, 0.312, 0.16), ("wheel_front", FRONT, 0.300, 0.12)):
        k.begin(node, c)
        A.tyre(k, c, radius, width, 0.216)
        A.rim_barrel(k, c, width, 0.216)
        A.rim_stripe(k, c, width, 0.216, "accent", band=0.005)
        A.spokes(k, c, 0.216, 0.05, count=5, style="y", width=0.024, spread=0.2)
        A.hub(k, c, width)
    # Rear sprocket on the left, inside the chain line
    k.begin("wheel_rear")
    k.lathe([(0, -0.004), (0.098, -0.004), (0.098, 0.004), (0, 0.004)], (-0.095, REAR[1], REAR[2]), "steel_dark", axis="x", seg=k.q(42, 14),
            ripple=(lambda i, j: 0.006 if (j in (1, 2) and i % 2) else 0.0) if not L1 else None, sharp=20)
    if not L1:
        for i in range(5):
            a = 2 * math.pi * i / 5
            k.cylinder(0.012, 0.012, (-0.095, REAR[1] + math.cos(a) * 0.06, REAR[2] + math.sin(a) * 0.06), "vent", axis="x", seg=10)

    k.begin("disc_rear", REAR)
    A.disc(k, (0.07, REAR[1], REAR[2]), 0.11, style="petal", carrier="dark_metal", arms=5)
    k.begin("disc_front", FRONT)
    for side in (-1, 1):
        A.disc(k, (side * 0.064, FRONT[1], FRONT[2]), 0.15, style="petal", carrier="dark_metal", arms=6)

    # --- Forks: conventional 41 mm, chrome stanchions in black sliders
    A.fork_pair(k, x=0.1, axle=(FRONT[1], FRONT[2]), top=TOP, pivot=(0.1, 0.64, 0.56), usd=False, r_tube=0.0205,
                outer_mat="dark_metal", inner_mat="chrome", foot_mat="dark_metal", cap_mat="dark_metal",
                calipers=(-1, 1), disc_x=0.064, disc_r=0.15, caliper_mat="caliper", caliper_angle=200, split=0.46)

    # --- Handlebar: a black tapered bar on risers, silver levers, angular mirrors
    k.begin("handlebar", (0, 0.99, 0.37))
    clamp = Vector((0, 0.985, 0.385))
    for side in (-1, 1):
        g = Vector((side * GRIP[0], GRIP[1], GRIP[2]))
        bend = Vector((side * 0.13, 0.99, 0.37))
        k.tube([clamp, clamp + Vector((side * 0.06, 0, 0)), bend, g - Vector((side * 0.08, 0, -0.006)), g + Vector((side * 0.07, 0, 0))],
               [0.014, 0.014, 0.013, 0.0115, 0.0115], "dark_metal", seg=k.q(10, 6), smooth=2)
        A.bar_controls(k, g, bend, side, lever_mat="steel", housing="dark_metal")
        k.cylinder(0.018, 0.04, (side * 0.05, 0.965, 0.39), "dark_metal", seg=k.q(10, 6))
        # Mirror: a stalk from the perch to a sharp-cornered head
        root = Vector((side * 0.19, 1.0, 0.36))
        head = Vector((side * 0.29, 1.17, 0.38))
        k.tube([root, root + Vector((side * 0.02, 0.06, 0.005)), head], 0.0065, "dark_metal", seg=k.q(6, 4), smooth=2)
        k.loft([(head.z - 0.012, head.y - 0.02, head.y + 0.03, 0.03, 2.6, 2.6, 0.5, 1, 1, head.x + side * 0.02),
                (head.z - 0.004, head.y - 0.035, head.y + 0.04, 0.07, 3.2, 3.2, 0.5, 0.9, 0.8, head.x + side * 0.04),
                (head.z + 0.012, head.y - 0.032, head.y + 0.038, 0.068, 3.2, 3.2, 0.5, 0.9, 0.8, head.x + side * 0.04),
                (head.z + 0.02, head.y - 0.012, head.y + 0.02, 0.03, 2.6, 2.6, 0.5, 1, 1, head.x + side * 0.03)],
               "dark_metal", ring=k.q(12, 6), steps=1, sharp=40)

    # --- Brake light: a slim LED bar under the tail's point
    k.begin("brake_light", (0, 0.955, -0.71))
    k.box((0.1, 0.03, 0.03), (0, 0.955, -0.712), "brake", rot=(0.7, 0, 0), bevel=0.008)
    if not L1:
        for side in (-1, 1):
            k.box((0.05, 0.012, 0.02), (side * 0.035, 0.98, -0.7), "brake", rot=(0.7, 0, side * 0.3), bevel=0.003)

    # --- Headlight: twin LED units under a sharp brow
    k.begin("headlight", (0, 0.77, 0.67))
    for side in (-1, 1):
        k.box((0.072, 0.032, 0.02), (side * 0.04, 0.765, 0.68), "headlight", rot=(-0.35, 0, side * -0.2), bevel=0.008)
        k.box((0.05, 0.01, 0.012), (side * 0.05, 0.795, 0.67), "headlight", rot=(-0.35, 0, side * -0.32), bevel=0.003)
    k.box((0.03, 0.04, 0.012), (0, 0.765, 0.685), "dark_metal", rot=(-0.35, 0, 0), bevel=0.004)

    k.begin("body")
    body(k)


def body(k):
    L1 = k.lod == 1
    ring = k.q(18, 10)

    # Yokes, stem, headstock
    stem, axis, back = A.yokes(k, 0.1, (FRONT[1], FRONT[2]), TOP, 0.0205, offset=0.034, mat="dark_metal", lower_t=0.79)
    head_a = Vector((0, FRONT[1], FRONT[2])) + Vector((0, axis.y, axis.z)) * FORK_LEN * 0.77 + back * 0.034
    head_b = Vector((0, FRONT[1], FRONT[2])) + Vector((0, axis.y, axis.z)) * FORK_LEN * 0.98 + back * 0.034
    k.rod(tuple(head_a), tuple(head_b), 0.032, "accent", seg=k.q(14, 8))

    # Headlight cowl: small, low and ahead of the fork tubes, a sharp wedge
    # over the lights with a lime band along the top of each flank and a lime
    # line under the lamps
    def cowl(u, up, side):
        if 0.2 < u < 0.95 and 0.12 < up < 0.42 and abs(side) > 0.55:
            return "accent"
        if 0.35 < u < 0.9 and -0.5 < up < -0.36 and abs(side) > 0.55:
            return "accent"
        return "paint"

    k.loft([(0.53, 0.74, 0.87, 0.085, 3.4, 3, 0.5, 0.75, 0.8),
            (0.57, 0.725, 0.865, 0.105, 3.4, 3, 0.5, 0.7, 0.75),
            (0.615, 0.725, 0.845, 0.102, 3.6, 3, 0.55, 0.62, 0.65),
            (0.65, 0.735, 0.82, 0.085, 3.6, 3, 0.55, 0.55, 0.6),
            (0.67, 0.745, 0.795, 0.055, 3.2, 3, 0.5, 0.55, 0.6)],
           cowl, ring=k.q(24, 12), steps=k.q(3, 1), sharp=28)
    k.box((0.15, 0.012, 0.05), (0, 0.797, 0.66), "dark_metal", rot=(-0.35, 0, 0), bevel=0.004)

    # Smoked fly screen rising steeply from the cowl toward the bars, the dash behind it
    def screen(u, v):
        across = (v - 0.5) * 2
        half = 0.095 - 0.03 * u
        return (across * half, 0.84 + 0.13 * u + 0.012 * (1 - across * across), 0.635 - 0.08 * u - 0.03 * across * across)

    k.sheet(screen, "glass", nu=k.q(4, 2), nv=k.q(6, 3), thick=0.005)
    k.box((0.13, 0.085, 0.03), (0, 0.97, 0.49), "dark_metal", rot=(0.85, 0, 0), bevel=0.008)
    k.box((0.105, 0.065, 0.006), (0, 0.982, 0.477), "dash", rot=(0.85, 0, 0), bevel=0)
    k.rod((0, 0.86, 0.6), (0, 0.95, 0.5), 0.012, "dark_metal", seg=k.q(8, 5))
    # Front indicators on the cowl's flanks
    for side in (-1, 1):
        k.rod((side * 0.08, 0.82, 0.57), (side * 0.12, 0.815, 0.59), 0.006, "dark_metal", seg=6)
        k.loft([(0.575, 0.803, 0.823, 0.01, 2.4, 2.4, 0.5, 1, 1, side * 0.13), (0.6, 0.799, 0.827, 0.014, 2.4, 2.4, 0.5, 1, 1, side * 0.135),
                (0.62, 0.806, 0.82, 0.008, 2.4, 2.4, 0.5, 1, 1, side * 0.138)], "signal", ring=k.q(10, 6), steps=1)

    # Tank: low and angular, a flat crown with hard edges down each flank,
    # sloping from a high front to the seat
    k.loft([(0.44, 0.88, 0.95, 0.07, 4.5, 3),
            (0.4, 0.82, 0.975, 0.15, 5, 3.4, 0.6, 0.55, 0.9),
            (0.3, 0.78, 0.985, 0.18, 5, 3.4, 0.6, 0.55, 0.86),
            (0.16, 0.77, 0.97, 0.18, 5, 3.4, 0.6, 0.55, 0.84),
            (0.04, 0.78, 0.93, 0.15, 4.5, 3.0, 0.6, 0.58, 0.8),
            (-0.03, 0.79, 0.88, 0.115, 4, 2.8),
            (-0.07, 0.8, 0.845, 0.07)],
           "paint", ring=k.q(16, 10), steps=k.q(2, 1), sharp=22)
    # Tank side covers: a black panel low on each flank, its lower edge a
    # lime line that climbs toward the seat
    for side in (-1, 1):
        k.panel([(0.2, 0.85), (0.08, 0.84), (-0.02, 0.83), (-0.05, 0.8), (0.04, 0.775), (0.18, 0.78)], side * 0.163, 0.012, "paint", toe=side * 0.12, bevel=0.003)
        k.panel([(0.18, 0.786), (0.04, 0.781), (-0.05, 0.806), (-0.055, 0.796), (0.04, 0.771), (0.18, 0.776)], side * 0.168, 0.004, "accent", toe=side * 0.12, bevel=0)
    k.cylinder(0.046, 0.01, (0, 0.99, 0.25), "dark_metal", seg=k.q(16, 8))
    if not L1:
        k.cylinder(0.03, 0.006, (0, 0.997, 0.25), "steel_dark", seg=12)
        # Ignition barrel
        k.cylinder(0.018, 0.03, (0, 0.95, 0.41), "steel_dark", rot=(-0.4, 0, 0), seg=10)

    # Shrouds: curved panels wrapping the tank's flanks and the radiator,
    # tapering to a leading point that aims forward and down at the front
    # axle; tank and shrouds read as one wedge falling forward. Two lime
    # lines run along each.
    def shroud_at(side, u, v, lift=0.0):
        z = 0.12 + 0.53 * u
        top = 0.935 - 0.18 * u ** 1.1
        bottom = 0.665 + 0.07 * u
        y = top + (bottom - top) * v
        w = 0.178 - 0.075 * u ** 1.3
        x = w * (0.9 + 0.1 * math.sin(math.pi * v)) + 0.022 * (1 - u) * math.sin(math.pi * v) - 0.03 * v * v + lift
        return (side * x, y, z)

    for side in (-1, 1):
        k.sheet(lambda u, v, side=side: shroud_at(side, u, v), "paint", nu=k.q(10, 4), nv=k.q(6, 3), thick=0.012)
        if not L1:
            for v0 in (0.2, 0.31):
                k.sheet(lambda u, v, side=side, v0=v0: shroud_at(side, 0.08 + 0.88 * u, v0 + 0.035 * v, 0.008), "accent", nu=8, nv=1, thick=0.003)
        else:
            k.sheet(lambda u, v, side=side: shroud_at(side, 0.08 + 0.88 * u, 0.2 + 0.14 * v, 0.008), "accent", nu=3, nv=1, thick=0.003)

    # Radiator: a core leaning back, side tanks, a grille of fins in front
    rad = A.Matrix.Translation(Vector((0, 0.6, 0.4))) @ A.euler(-0.22, 0, 0)
    k.fbox(rad, (0.3, 0.28, 0.04), (0, 0, 0), "dark_metal", bevel=0.006)
    k.fbox(rad, (0.27, 0.25, 0.004), (0, 0, 0.021), "vent", bevel=0)
    if not L1:
        for n in range(9):
            k.fbox(rad, (0.27, 0.004, 0.008), (0, -0.115 + n * 0.029, 0.026), "dark_metal", bevel=0)
    for side in (-1, 1):
        k.fbox(rad, (0.02, 0.27, 0.05), (side * 0.155, 0, 0), "dark_metal", bevel=0.005)
    k.tube([(0.1, 0.72, 0.38), (0.12, 0.7, 0.3), (0.1, 0.66, 0.28)], 0.012, "rubber", seg=k.q(8, 5))

    # Seat: a short rider's seat, a step, the pillion pad high on the tail
    k.loft([(0.0, 0.77, 0.81, 0.1, 3, 3), (-0.06, 0.765, 0.8, 0.15, 3, 3), (-0.18, 0.765, 0.795, 0.15, 3.2, 3), (-0.27, 0.775, 0.815, 0.13, 3, 3),
            (-0.31, 0.79, 0.84, 0.09)], "seat", ring=k.q(16, 8), steps=k.q(2, 1))
    k.loft([(-0.31, 0.855, 0.885, 0.07, 3, 3), (-0.35, 0.865, 0.91, 0.115, 3, 3), (-0.48, 0.905, 0.95, 0.1, 3, 3), (-0.56, 0.93, 0.97, 0.06)],
           "seat", ring=k.q(14, 8), steps=k.q(2, 1))

    # Tail unit: side panels kicking sharply up to a high point over the
    # light, a lime line low on each
    def tail(u, up, side):
        if 0.15 < u < 0.65 and -0.55 < up < -0.38 and abs(side) > 0.5:
            return "accent"
        return "paint"

    k.loft([(-0.02, 0.62, 0.79, 0.14, 3.2, 3),
            (-0.18, 0.635, 0.825, 0.15, 3.2, 3),
            (-0.32, 0.675, 0.885, 0.14, 3.4, 3),
            (-0.46, 0.74, 0.945, 0.12, 3.6, 3),
            (-0.58, 0.81, 0.995, 0.095, 3.6, 3),
            (-0.67, 0.87, 1.02, 0.065, 3.4, 3),
            (-0.72, 0.925, 1.015, 0.03)],
           tail, ring=k.q(18, 10), steps=k.q(3, 1), sharp=30)
    k.loft([(-0.3, 0.655, 0.7, 0.1), (-0.48, 0.725, 0.77, 0.08), (-0.64, 0.83, 0.87, 0.05)], "dark_metal", ring=k.q(10, 6), steps=1)
    # Pillion grab handles under the pad
    for side in (-1, 1):
        k.tube([(side * 0.1, 0.84, -0.34), (side * 0.12, 0.88, -0.45), (side * 0.095, 0.93, -0.55)], 0.011, "dark_metal", seg=k.q(8, 5), smooth=2)

    # Plate hanger: a long arm down and back from under the light, the plate,
    # the indicators
    k.loft([(-0.56, 0.74, 0.8, 0.06), (-0.74, 0.7, 0.75, 0.05), (-0.92, 0.66, 0.71, 0.045)], "dark_metal", ring=k.q(10, 6), steps=k.q(2, 1))
    k.box((0.18, 0.12, 0.006), (0, 0.61, -0.965), "plate", rot=(0.3, 0, 0), bevel=0)
    k.box((0.19, 0.13, 0.008), (0, 0.61, -0.96), "dark_metal", rot=(0.3, 0, 0), bevel=0.003)
    k.box((0.06, 0.02, 0.006), (0, 0.53, -0.99), "reflector", rot=(0.3, 0, 0), bevel=0.002)
    for side in (-1, 1):
        k.rod((side * 0.03, 0.78, -0.82), (side * 0.11, 0.785, -0.825), 0.0065, "dark_metal", seg=6)
        k.loft([(-0.81, 0.773, 0.795, 0.012, 2.4, 2.4, 0.5, 1, 1, side * 0.12), (-0.835, 0.77, 0.798, 0.015, 2.4, 2.4, 0.5, 1, 1, side * 0.12),
                (-0.85, 0.777, 0.792, 0.009, 2.4, 2.4, 0.5, 1, 1, side * 0.12)], "signal", ring=k.q(10, 6), steps=1)
    # Rear inner guard over the tyre, and a chain guard
    k.guard((REAR[1], REAR[2]), 0.345, 0.17, math.radians(60), math.radians(128), "dark_metal", crown=0.03, nu=k.q(8, 4), nv=k.q(4, 2))
    k.panel([(-0.2, 0.48), (-0.5, 0.42), (-0.52, 0.4), (-0.2, 0.455)], -0.11, 0.006, "dark_metal", bevel=0.002)

    # Front mudguard with a lime slash each side
    k.guard((FRONT[1], FRONT[2]), 0.318, 0.13, math.radians(48), math.radians(122), "paint_dark", crown=0.03, nu=k.q(10, 5), nv=k.q(5, 3))
    for side in (-1, 1):
        def slash(u, v, side=side):
            a = math.radians(72 + 30 * u)
            across = side * (0.72 + 0.16 * v - 0.12 * u)
            r = 0.318 - 0.03 * across * across + 0.003
            return (across * 0.065, FRONT[1] + math.sin(a) * r, FRONT[2] + math.cos(a) * r)
        if not L1:
            k.sheet(slash, "accent", nu=4, nv=1, thick=0.002)

    # Trellis frame in lime: rails from the headstock over the engine to the
    # pivot plates, braced into triangles
    head = (0.04, 0.88, 0.41)
    headlo = (0.045, 0.8, 0.445)
    rail1, rail2, rail3 = (0.12, 0.8, 0.26), (0.14, 0.73, 0.04), (0.14, 0.64, -0.1)
    down1, down2 = (0.11, 0.68, 0.37), (0.105, 0.42, 0.36)
    cyl, low = (0.125, 0.53, 0.25), (0.14, 0.5, -0.06)
    r_tube = 0.0075
    for side in (-1, 1):
        S = lambda p: (side * p[0], p[1], p[2])
        k.tube([S(head), S(rail1), S(rail2), S(rail3)], r_tube, "accent", seg=k.q(10, 6), smooth=k.q(2, 1))
        k.tube([S(headlo), S(down1), S(down2)], r_tube, "accent", seg=k.q(10, 6), smooth=k.q(2, 1))
        for a, b in ((rail1, cyl), (down1, rail1), (rail2, low), (rail2, cyl)):
            k.rod(S(a), S(b), r_tube * 0.9, "accent", seg=k.q(8, 5))
        # Pivot plate, black, over the swingarm pivot
        k.panel([(-0.05, 0.56), (-0.16, 0.55), (-0.19, 0.44), (-0.16, 0.35), (-0.09, 0.34), (-0.05, 0.42)], side * 0.142, 0.02, "dark_metal", bevel=0.006)
        k.cylinder(0.022, 0.012, (side * 0.155, PIVOT[0], PIVOT[1]), "steel_dark", axis="x", seg=k.q(14, 8))
        # Subframe up to the tail
        k.rod(S(rail3), (side * 0.08, 0.9, -0.55), 0.01, "dark_metal", seg=k.q(6, 4))
        k.rod((side * 0.14, 0.56, -0.16), (side * 0.08, 0.86, -0.48), 0.009, "dark_metal", seg=k.q(6, 4))
    k.rod((-0.13, 0.6, 0.0), (0.13, 0.6, 0.0), 0.0075, "accent", seg=k.q(8, 5))

    engine(k)
    exhaust(k)
    rear_end(k)


def engine(k):
    L1 = k.lod == 1
    # Crankcase: a rounded block, deeper at the back where the gearbox is
    k.loft([(0.27, 0.22, 0.46, 0.12, 3, 3), (0.22, 0.17, 0.5, 0.15, 3.2, 3.2), (0.0, 0.16, 0.52, 0.15, 3.2, 3.2), (-0.12, 0.2, 0.56, 0.14, 3, 3),
            (-0.17, 0.3, 0.56, 0.12, 3, 3), (-0.19, 0.38, 0.52, 0.08)], "dark_metal", ring=k.q(18, 10), steps=k.q(2, 1), sharp=35)
    # Cylinder block and head, leaning forward
    tilt = -0.42
    cyl = A.Matrix.Translation(Vector((0, 0.5, 0.21))) @ A.euler(tilt, 0, 0)
    k.fbox(cyl, (0.24, 0.17, 0.15), (0, 0, 0), "dark_metal", bevel=0.012)
    if not L1:
        for n in range(4):
            k.fbox(cyl, (0.246, 0.006, 0.152), (0, -0.06 + n * 0.035, 0), "steel_dark", bevel=0)
    k.fbox(cyl, (0.245, 0.07, 0.17), (0, 0.115, 0.005), "dark_metal", bevel=0.014)
    # Cam cover, with its ribs
    k.fbox(cyl, (0.23, 0.05, 0.15), (0, 0.17, 0.0), "dark_metal", bevel=0.018)
    if not L1:
        for side in (-1, 1):
            k.fbox(cyl, (0.006, 0.02, 0.13), (side * 0.06, 0.198, 0), "steel_dark", bevel=0.002)
        # Spark plug caps
        for side in (-1, 1):
            k.rod(tuple(cyl @ Vector((side * 0.05, 0.19, -0.02))), tuple(cyl @ Vector((side * 0.05, 0.23, -0.04))), 0.01, "rubber", seg=8)
    # Clutch cover (right) and stator cover (left), sprocket cover (left)
    seg = k.q(22, 10)
    k.lathe([(0, 0), (0.09, 0), (0.092, 0.012), (0.08, 0.03), (0.05, 0.038), (0, 0.04)], (0.15, 0.35, -0.02), "dark_metal", axis="x", seg=seg)
    k.lathe([(0, 0), (0.075, 0), (0.077, 0.012), (0.06, 0.03), (0, 0.034)], (-0.15, 0.38, 0.12), "dark_metal", axis="x", rot=(0, 0, math.pi), seg=seg)
    if not L1:
        k.lathe([(0, 0), (0.03, 0), (0.03, 0.006), (0, 0.006)], (0.19, 0.35, -0.02), "steel_dark", axis="x", seg=12)
        k.lathe([(0, 0), (0.025, 0), (0.025, 0.006), (0, 0.006)], (-0.185, 0.38, 0.12), "steel_dark", axis="x", rot=(0, 0, math.pi), seg=12)
    k.box((0.03, 0.12, 0.13), (-0.14, 0.38, -0.08), "dark_metal", bevel=0.012)
    A.bolts(k, (0.19, 0.35, -0.02), 0.082, 10, 1, mat="steel_dark")
    A.bolts(k, (-0.185, 0.38, 0.12), 0.068, 8, -1, mat="steel_dark")
    A.cable(k, [(0.05, 0.98, 0.33), (0.08, 0.92, 0.42), (0.07, 0.8, 0.44), (0.1, 0.7, 0.3)])
    A.cable(k, [(-0.09, 0.98, 0.33), (-0.1, 0.9, 0.42), (-0.08, 0.78, 0.42), (-0.12, 0.6, 0.25)])
    # Oil filter and sump
    k.cylinder(0.035, 0.07, (0.0, 0.25, 0.27), "dark_metal", rot=(-1.1, 0, 0), seg=k.q(14, 8))
    k.box((0.2, 0.06, 0.24), (0, 0.17, 0.08), "dark_metal", bevel=0.015)
    # Water pump and hoses on the left
    if not L1:
        k.cylinder(0.035, 0.03, (-0.14, 0.27, 0.18), "steel_dark", axis="x", seg=12)
        k.tube([(-0.13, 0.28, 0.2), (-0.12, 0.38, 0.32), (-0.13, 0.48, 0.36)], 0.011, "rubber", seg=8)


def exhaust(k):
    # Bronze headers out of the head, down in front of the engine and back
    # under it into a box silencer beneath the pivot
    for side in (-1, 1):
        k.tube([(side * 0.05, 0.59, 0.34), (side * 0.055, 0.53, 0.4), (side * 0.06, 0.42, 0.41), (side * 0.055, 0.28, 0.36), (side * 0.04, 0.17, 0.25),
                (side * 0.025, 0.13, 0.08)], 0.019, "copper", seg=k.q(10, 6), smooth=k.q(3, 2))
    k.loft([(0.12, 0.11, 0.2, 0.06), (0.06, 0.1, 0.23, 0.1, 3.4, 3.4), (-0.1, 0.1, 0.25, 0.115, 3.4, 3.4), (-0.24, 0.12, 0.26, 0.11, 3.4, 3.4),
            (-0.3, 0.14, 0.255, 0.08, 3, 3)], "dark_metal", ring=k.q(16, 8), steps=k.q(2, 1))
    # The outlet, angled out under the right footpeg
    k.lathe([(0, 0), (0.03, 0), (0.034, 0.05), (0.034, 0.08), (0.026, 0.085), (0, 0.085)], (0.06, 0.18, -0.26), "steel", to=(0.16, 0.22, -0.36), seg=k.q(14, 8))
    # A black cover over each side of the silencer
    for side in (-1, 1):
        k.panel([(0.12, 0.25), (0.06, 0.14), (-0.22, 0.15), (-0.28, 0.22), (-0.02, 0.27)], side * 0.118, 0.01, "paint", toe=side * -0.05, bevel=0.003)


def rear_end(k):
    L1 = k.lod == 1
    # Swingarm: black box-section arms that curve up a little, a cross brace,
    # adjuster blocks at the axle
    for side in (-1, 1):
        x = side * 0.1
        pts = [(x, PIVOT[0], PIVOT[1]), (x, PIVOT[0] + 0.012, PIVOT[1] - 0.2), (x, REAR[1] + 0.03, REAR[2] + 0.18), (x, REAR[1], REAR[2] - 0.02)]
        prev = None
        for a, b in zip(pts, pts[1:]):
            k.beam(a, b, (0.035, 0.07 if prev is None else 0.06), "dark_metal", bevel=0.01)
            prev = b
        k.box((0.04, 0.045, 0.06), (side * 0.112, REAR[1], REAR[2]), "steel_dark", bevel=0.006)
        k.cylinder(0.014, 0.012, (side * 0.13, REAR[1], REAR[2]), "steel", axis="x", seg=k.q(10, 6))
    k.box((0.2, 0.06, 0.07), (0, PIVOT[0] + 0.01, PIVOT[1] - 0.12), "dark_metal", bevel=0.012)
    k.rod((-0.16, PIVOT[0], PIVOT[1]), (0.16, PIVOT[0], PIVOT[1]), 0.016, "steel_dark", seg=k.q(10, 6))
    # The shock, laid nearly flat above the arm's front on the right
    a, b = (0.04, 0.6, -0.12), (0.06, 0.5, -0.35)
    length = (Vector(b) - Vector(a)).length
    coils = 8
    k.lathe([(0.03 if n % 2 else 0.022, length * (0.15 + 0.7 * n / (coils * 2))) for n in range(coils * 2 + 1)], a, "steel_dark", to=b, seg=k.q(10, 6), sharp=80)
    k.rod(a, b, 0.016, "dark_metal", seg=k.q(8, 5))
    # Chain: top and bottom runs on the left, the front sprocket
    A.chain(k, -0.095, (0.4, -0.04, 0.045), (REAR[1], REAR[2], 0.1))
    # Rear caliper on its hanger, gripping the disc behind the axle
    A.caliper(k, (REAR[1], REAR[2]), 0.11, 205, 0.07, mat="caliper", lug_mat="dark_metal", lug_to=(0.1, REAR[1] + 0.02, REAR[2] + 0.12), size=0.85)

    # Footpegs on black hangers with heel plates, the pillion pegs, the controls
    for side in (-1, 1):
        x, y, z = side * PEG[0], PEG[1], PEG[2]
        k.rod((x - side * 0.07, y, z), (x + side * 0.05, y, z), 0.012, "rubber", seg=k.q(10, 6))
        k.panel([(z + 0.05, y + 0.03), (z + 0.0, y + 0.13), (z - 0.06, y + 0.12), (z - 0.04, y - 0.01), (z + 0.02, y - 0.025)], side * (PEG[0] - 0.07), 0.01, "dark_metal", bevel=0.003)
        px, py, pz = side * 0.19, 0.5, -0.42
        k.rod((px - side * 0.05, py, pz), (px + side * 0.04, py, pz), 0.011, "rubber", seg=k.q(8, 5))
        k.tube([(side * 0.12, 0.66, -0.36), (side * 0.15, 0.56, -0.4), (px - side * 0.04, py, pz)], 0.011, "dark_metal", seg=k.q(8, 5))
    k.rod((-PEG[0] + 0.05, PEG[1] - 0.01, PEG[2] + 0.02), (-PEG[0] + 0.02, PEG[1] + 0.02, PEG[2] + 0.18), 0.007, "steel", seg=6)
    k.rod((PEG[0] - 0.05, PEG[1] - 0.01, PEG[2] + 0.02), (PEG[0] - 0.02, PEG[1] - 0.03, PEG[2] + 0.17), 0.007, "steel", seg=6)
    # Side stand, folded up on the left
    k.side_stand((-0.15, 0.3, -0.04), (-0.27, 0.06, 0.06), 0.011, "steel_dark", seg=k.q(8, 5), pad=not L1)


A.build(build, "bike01_z650", seed=101, colours={"paint": BLACK, "paint_dark": 0x050506, "accent": LIME, "rim": 0x121316, "caliper": 0x24262B, "copper": 0x6E4630},
        anchors={"grip": GRIP, "peg": PEG, "seat": SEAT},
        views={"match_s22_125": ((-2.75, 0.85, 0.75), (0, 0.55, -0.03), 30), "match_s22_212": ((2.4, 0.95, 1.9), (0, 0.6, 0.15), 40),
               "front": ((0.0, 0.95, 4.2), (0, 0.6, 0.2), 55), "rear": ((0.0, 1.1, -4.2), (0, 0.6, -0.2), 55)})
