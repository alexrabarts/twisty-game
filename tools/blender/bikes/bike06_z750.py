# The 748 cc inline-four naked (2007-12 generation) from the 2019, 2023 and
# 2025 trips, as it stood in 2019 and 2023: gloss black, with silver frame
# covers, heel plates and radiator-shroud inserts, a black engine with silver
# covers, a muscular angular tank, black radiator shrouds, the sharp headlamp
# under its nose cowl and small fly screen, black upside-down forks with
# chrome sliders, twin petal front discs, black six-spoke wheels, four
# bronzed headers into a collector under the engine and the stock short
# triangular silencer low on the right, a stepped seat and a sharp tail.
# (By 2025 it wore a taller tinted screen, hand guards and a long black oval
# aftermarket silencer; not modelled here.)
#
# Real size: wheelbase 1440 mm, rake 24.5 degrees, seat 815 mm, 120/70 ZR17
# and 180/55 ZR17 tyres, 300 mm front and 250 mm rear petal discs.
#   blender --background --factory-startup --python tools/blender/bikes/bike06_z750.py
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_B as kb  # noqa: E402
import bike_parts as parts  # noqa: E402

NAME = "bike06_z750"
FRONT, REAR = (0, 0.3, 0.72), (0, 0.315, -0.72)
RAKE = math.radians(24.5)
FORK_LENGTH = 0.76
TOP = (FRONT[1] + FORK_LENGTH * math.cos(RAKE), FRONT[2] - FORK_LENGTH * math.sin(RAKE))
GRIP = (0.37, 1.05, 0.31)
PEG = (0.165, 0.37, -0.13)
DISC_FRONT, DISC_REAR = 0.15, 0.125
BLACK = 0x101114


def rounded_triangle(width, height, corner=0.012, steps=3):
    """A rounded triangle, flat on top, its point down, as (side, up) points."""
    pts = [(-width / 2, height / 3), (width / 2, height / 3), (0, -2 * height / 3)]
    out = []
    for i, p in enumerate(pts):
        prev, nxt = Vector(pts[i - 1]), Vector(pts[(i + 1) % 3])
        p = Vector(p)
        d1, d2 = (prev - p).normalized(), (nxt - p).normalized()
        for s in range(steps + 1):
            t = s / steps
            q = (p + d1 * corner) * (1 - t) ** 2 + p * 2 * t * (1 - t) + (p + d2 * corner) * t * t
            out.append((q.x, q.y))
    return out


def build(k):
    low = k.low
    seg = (lambda hi, lo: lo if low else hi)  # noqa: E731

    # ------------------------------------------------ wheels and brakes
    k.begin("wheel_front", FRONT)
    kb.wheel(k, FRONT, 0.3, 0.12, 0.216, spokes=6, style="straight", tread="road", hub=0.05, hub_width=0.05)
    k.begin("wheel_rear", REAR)
    kb.wheel(k, REAR, 0.315, 0.18, 0.216, spokes=6, style="straight", tread="road", hub=0.055, hub_width=0.075)
    if not low:
        k.lathe([(0, -0.005), (0.11, -0.005), (0.11, 0.005), (0, 0.005)], (-0.1, REAR[1], REAR[2]), "steel_dark", axis="x", seg=46,
                ripple=lambda i, j: 0.006 if (j in (1, 2) and i % 2) else 0.0, sharp=20)
    else:
        k.cylinder(0.11, 0.01, (-0.1, REAR[1], REAR[2]), "steel_dark", axis="x", seg=16)

    k.begin("disc_front", (0.064, FRONT[1], FRONT[2]))
    for side in (-1, 1):
        kb.disc(k, (side * 0.064, FRONT[1], FRONT[2]), DISC_FRONT, petal=10, holes=30, carrier="dark_metal", arms=5)
    k.begin("disc_rear", (0.094, REAR[1], REAR[2]))
    kb.disc(k, (0.094, REAR[1], REAR[2]), DISC_REAR, petal=9, holes=24, carrier="steel_dark", arms=0, inner_frac=0.6)

    # Black upside-down forks, chrome sliders, a caliper behind each leg
    kb.forks(k, 0.102, FRONT[1:], TOP, 0.0205, usd=True, outer="dark_metal", inner="chrome", disc_r=DISC_FRONT, disc_x=0.064, disc_sides=(-1, 1),
             caliper_angle=205, caliper_mat="caliper", yoke="dark_metal", bottom="dark_metal")

    # ------------------------------------------------ bar, lamp, lights
    k.begin("handlebar", (0, 1.01, 0.41))
    kb.handlebar(k, GRIP, (0.995, 0.415), rise=0.045, sweep=0.05, radius=0.0135, mat="dark_metal")
    kb.mirror(k, (0.24, 1.05, 0.37), (0.27, 1.14, 0.38), (0.32, 1.2, 0.37), size=(0.065, 0.035))

    # The sharp lamp: a wide lens swept back at its corners under a pointed brow
    k.begin("headlight", (0, 0.84, 0.62))
    k.loft([(0.6, 0.79, 0.88, 0.1, 2.2, 2.2, 0.5, 0.75, 1.0), (0.625, 0.78, 0.885, 0.11, 2.4, 2.4, 0.5, 0.7, 1.0), (0.645, 0.795, 0.87, 0.085, 2.2, 2.2, 0.5, 0.7, 1.0)],
           "headlight", ring=seg(16, 8), steps=1)
    if not low:
        for side in (-1, 1):
            k.box((0.05, 0.035, 0.01), (side * 0.045, 0.83, 0.648), "chrome", rot=(-0.2, side * 0.25, 0), bevel=0.004)

    k.begin("brake_light", (0, 0.86, -0.84))
    k.loft([(-0.82, 0.845, 0.875, 0.05), (-0.85, 0.845, 0.875, 0.045), (-0.86, 0.85, 0.87, 0.03)], "brake", ring=10, steps=1)

    k.begin("body")
    # Lamp shell, the nose cowl over it and its small fly screen; the clocks behind
    k.loft([(0.5, 0.77, 0.9, 0.11, 2.6, 2.4), (0.58, 0.77, 0.9, 0.12, 2.6, 2.4), (0.62, 0.775, 0.895, 0.115, 2.4, 2.2)], "black_gloss", ring=seg(18, 10), steps=1)
    k.loft([(0.45, 0.86, 0.98, 0.12, 3, 2.4, 0.4, 0.6, 1), (0.55, 0.86, 0.96, 0.12, 3, 2.4, 0.35, 0.5, 1), (0.63, 0.87, 0.92, 0.09, 3, 2.4, 0.3, 0.4, 1),
            (0.66, 0.88, 0.9, 0.04)], "paint", ring=seg(18, 10), steps=seg(2, 1))

    def screen(u, v):
        across = (v - 0.5) * 2
        half = 0.09 - 0.03 * u
        return (across * half, 0.955 + 0.08 * u, 0.58 - 0.07 * u - 0.02 * across * across)

    k.sheet(screen, "glass", nu=seg(3, 2), nv=seg(4, 2), thick=0.005)
    k.box((0.16, 0.08, 0.05), (0, 0.99, 0.47), "dark_metal", rot=(-0.8, 0, 0), bevel=0.012)
    k.box((0.13, 0.06, 0.006), (0, 1.01, 0.485), "dash", rot=(-0.8, 0, 0), bevel=0)
    for side in (-1, 1):
        kb.indicator(k, (side * 0.1, 0.85, 0.52), (side * 0.15, 0.85, 0.53), radius=0.017, length=0.04, lens="white")
    k.rod((0, 0.79, 0.47), (0, 0.97, 0.39), 0.033, "dark_metal", seg=seg(16, 10))

    # Black front mudguard, a sharp hugger over the tyre
    k.guard((FRONT[1], FRONT[2]), 0.335, 0.135, math.radians(30), math.radians(155), "paint", crown=0.035, nu=seg(12, 6), nv=seg(5, 3))

    # ------------------------------------------------ tank, shrouds, radiator
    k.loft([
        (0.42, 0.86, 0.95, 0.08),
        (0.36, 0.78, 1.0, 0.15, 2.4, 2.8, 0.5, 0.75),
        (0.24, 0.74, 1.04, 0.19, 2.6, 3.0, 0.5, 0.72),
        (0.08, 0.73, 1.03, 0.19, 2.6, 3.0, 0.5, 0.72),
        (-0.04, 0.75, 0.97, 0.165, 2.6, 2.8, 0.5, 0.75),
        (-0.1, 0.78, 0.9, 0.12, 2.4, 2.6),
        (-0.13, 0.8, 0.86, 0.07),
    ], "paint", ring=seg(26, 14), steps=seg(4, 2))
    if not low:
        k.cylinder(0.036, 0.01, (0, 1.045, 0.2), "steel_dark", seg=18, rot=(0.12, 0, 0))
    for side in (-1, 1):
        # Shroud: a scoop wrapping the radiator's side, swept forward and
        # down to a point, the silver insert along its outer foot
        def scoop(u, up, across, side=side):
            return "silver" if (up < -0.5 and across * side > 0.2 and u > 0.15) else "paint"

        k.loft([(0.18, 0.66, 0.95, 0.02, 2.4, 2.4, 0.5, 1, 1, side * 0.185), (0.25, 0.56, 0.97, 0.034, 2.6, 2.4, 0.55, 1, 1, side * 0.2),
                (0.33, 0.5, 0.94, 0.04, 2.6, 2.4, 0.55, 1, 1, side * 0.205), (0.41, 0.5, 0.87, 0.036, 2.6, 2.4, 0.5, 1, 1, side * 0.198),
                (0.47, 0.55, 0.77, 0.022, 2.4, 2.4, 0.5, 1, 1, side * 0.185), (0.5, 0.6, 0.68, 0.01, 2.4, 2.4, 0.5, 1, 1, side * 0.175)],
               scoop, ring=seg(14, 8), steps=seg(3, 1))
    k.box((0.4, 0.34, 0.05), (0, 0.62, 0.34), "dark_metal", rot=(-0.28, 0, 0), bevel=0.012)
    k.box((0.36, 0.3, 0.01), (0, 0.62, 0.368), "vent", rot=(-0.28, 0, 0), bevel=0)

    # ------------------------------------------------ seat, tail
    k.loft([(0.0, 0.76, 0.81, 0.09), (-0.07, 0.75, 0.815, 0.15, 3, 3), (-0.3, 0.75, 0.82, 0.15, 3, 3), (-0.38, 0.76, 0.835, 0.12, 3, 3), (-0.41, 0.78, 0.845, 0.08)],
           "seat", ring=seg(18, 10), steps=seg(3, 2))
    k.loft([(-0.39, 0.82, 0.87, 0.07), (-0.43, 0.82, 0.885, 0.11, 3, 3), (-0.62, 0.84, 0.9, 0.085, 3, 3), (-0.67, 0.85, 0.9, 0.05)], "seat", ring=seg(16, 10), steps=seg(2, 1))

    # Tail cowl: sides sweeping up to a sharp point over the light
    k.loft([(-0.0, 0.66, 0.79, 0.14), (-0.2, 0.69, 0.82, 0.15, 3, 2.4), (-0.42, 0.75, 0.87, 0.13, 3, 2.4), (-0.62, 0.8, 0.9, 0.1, 3, 2.4), (-0.78, 0.83, 0.9, 0.065, 3, 2.4),
            (-0.85, 0.845, 0.885, 0.03)], "paint", ring=seg(18, 10), steps=seg(3, 2))
    # Side covers under the seat, closing the frame in from the tank to the tail
    k.loft([(0.0, 0.6, 0.77, 0.1), (-0.15, 0.6, 0.79, 0.125, 3, 3, 0.55), (-0.38, 0.66, 0.82, 0.12, 3, 3, 0.55), (-0.52, 0.72, 0.84, 0.095, 3, 3), (-0.6, 0.76, 0.85, 0.06)],
           "paint", ring=seg(16, 10), steps=seg(2, 1))
    # Passenger grab handles under the pillion
    for side in (-1, 1):
        k.tube([(side * 0.13, 0.8, -0.4), (side * 0.15, 0.83, -0.5), (side * 0.13, 0.85, -0.62)], 0.012, "dark_metal", seg=seg(8, 6))
    # Plate hanger down from the tail, with the indicators and reflector
    k.loft([(-0.74, 0.74, 0.8, 0.06), (-0.84, 0.66, 0.74, 0.055), (-0.92, 0.6, 0.67, 0.05)], "dark_metal", axis="z", ring=seg(10, 8), steps=1)
    kb.plate(k, (0, 0.58, -0.95), size=(0.2, 0.15), tilt=0.22)
    for side in (-1, 1):
        kb.indicator(k, (side * 0.04, 0.7, -0.88), (side * 0.12, 0.705, -0.89), radius=0.016, length=0.04, lens="white")
    if not low:
        k.box((0.06, 0.03, 0.01), (0, 0.48, -0.93), "reflector", rot=(0.22, 0, 0), bevel=0.002)
    # A hugger over the rear tyre
    k.guard((REAR[1], REAR[2]), 0.35, 0.13, math.radians(65), math.radians(118), "dark_metal", crown=0.03, nu=seg(8, 4), nv=seg(4, 3))

    # ------------------------------------------------ frame: backbone, silver covers, heel plates
    for side in (-1, 1):
        S = lambda y, z, x: (side * x, y, z)  # noqa: E731
        k.tube([S(0.95, 0.39, 0.04), S(0.86, 0.22, 0.08), S(0.78, 0.0, 0.1), S(0.62, -0.12, 0.12), S(0.46, -0.15, 0.12)], 0.02, "dark_metal", seg=seg(10, 6), smooth=2)
        k.rod(S(0.8, -0.05, 0.1), S(0.84, -0.7, 0.08), 0.012, "dark_metal", seg=seg(8, 6))
        k.rod(S(0.55, -0.15, 0.12), S(0.8, -0.5, 0.085), 0.011, "dark_metal", seg=seg(8, 6))
        # The silver frame cover with its grille, and the diagonal insert across the engine
        k.panel([(0.12, 0.76), (-0.08, 0.78), (-0.17, 0.62), (-0.16, 0.44), (-0.08, 0.42), (-0.02, 0.56), (0.06, 0.64)], side * 0.155, 0.02, "silver", toe=side * 0.03)
        if not low:
            for r in range(3):
                for c in range(4):
                    k.box((0.006, 0.012, 0.02), (side * 0.167, 0.7 - r * 0.035, 0.04 - c * 0.04 - r * 0.012), "vent", bevel=0)
        k.panel([(0.06, 0.665), (0.22, 0.62), (0.36, 0.58), (0.37, 0.54), (0.22, 0.565), (0.05, 0.6)], side * 0.172, 0.016, "silver", toe=-side * 0.08)
        # Heel plates round the pegs, drilled
        k.panel([(-0.04, 0.5), (-0.18, 0.5), (-0.23, 0.36), (-0.13, 0.3), (-0.05, 0.36)], side * 0.15, 0.012, "silver", toe=side * 0.02, bevel=0.003)
        if not low:
            for n in range(3):
                k.cylinder(0.011, 0.014, (side * 0.15, 0.45 - n * 0.035, -0.08 - n * 0.04), "vent", axis="x", seg=8)

    # ------------------------------------------------ engine: inline four, leaning forward
    crank = (0.35, 0.0)
    d = (math.sin(math.radians(58)), math.cos(math.radians(58)))
    lean = math.atan2(d[1], d[0])
    at = lambda t, x=0.0: (x, crank[0] + d[0] * t, crank[1] + d[1] * t)  # noqa: E731
    k.loft([(0.18, 0.2, 0.44, 0.17), (0.12, 0.16, 0.48, 0.2, 3, 3), (-0.12, 0.16, 0.48, 0.2, 3, 3), (-0.2, 0.22, 0.46, 0.18, 3, 3), (-0.24, 0.3, 0.42, 0.14)],
           "engine_black", ring=seg(16, 10), steps=2)
    k.box((0.36, 0.16, 0.15), at(0.17), "engine_black", rot=(lean, 0, 0), bevel=0.015)
    if not low:
        for n in range(6):
            k.box((0.375, 0.005, 0.165), at(0.11 + n * 0.022), "fin", rot=(lean, 0, 0), bevel=0)
    k.box((0.38, 0.08, 0.17), at(0.29), "engine_black", rot=(lean, 0, 0), bevel=0.015)
    k.box((0.34, 0.045, 0.14), at(0.35), "engine_black", rot=(lean, 0, 0), bevel=0.015)
    # Silver clutch cover on the right, the alternator cover on the left, and the sump
    k.lathe([(0, 0), (0.095, 0), (0.1, 0.02), (0.085, 0.034), (0, 0.038)], (0.2, 0.33, -0.06), "silver", axis="x", seg=seg(28, 12))
    k.lathe([(0, 0), (0.07, 0), (0.075, 0.018), (0.06, 0.03), (0, 0.032)], (-0.2, 0.36, -0.02), "silver", axis="x", rot=(0, 0, math.pi), seg=seg(24, 12))
    k.box((0.07, 0.07, 0.05), (0.22, 0.25, 0.12), "silver", bevel=0.012)
    k.box((0.22, 0.08, 0.26), (0, 0.15, 0.0), "engine_black", bevel=0.02)
    if not low:
        k.cylinder(0.028, 0.012, (0.24, 0.33, -0.06), "dark_metal", axis="x", seg=14)
        k.cylinder(0.04, 0.06, (0.0, 0.17, 0.16), "steel_dark", seg=14)

    # ------------------------------------------------ exhaust: four bronzed headers, the short triangular silencer
    for n, x in enumerate((-0.135, -0.045, 0.045, 0.135)):
        port = at(0.3, x)
        k.tube([(x, port[1] - 0.02, port[2] + 0.06), (x * 0.95, 0.43, 0.36), (x * 0.85, 0.27, 0.35), (x * 0.6, 0.16, 0.28), (x * 0.3, 0.12, 0.16)], 0.017, "header", seg=seg(10, 6), smooth=3)
    k.tube([(0, 0.12, 0.16), (0.0, 0.11, 0.0), (0.06, 0.13, -0.16), (0.13, 0.22, -0.26)], 0.04, "header", seg=seg(12, 8), smooth=2)
    shape = rounded_triangle(0.17, 0.16, corner=0.022, steps=seg(4, 1))
    kb.prism(k, (0.17, 0.25, -0.25), (0.205, 0.43, -0.66), shape, "fin", cap="silver", scale_b=0.92)
    if not low:
        k.tube([(0.13, 0.22, -0.26), (0.17, 0.25, -0.25)], 0.04, "can_black", seg=12)
        # The black heat shield on the can's upper outer face, two bolts
        k.box((0.012, 0.045, 0.24), (0.245, 0.37, -0.45), "can_black", rot=(0.41, 0, 0), bevel=0.005)
        for n in range(2):
            k.cylinder(0.006, 0.01, (0.252, 0.34 + n * 0.07, -0.38 - n * 0.15), "silver", axis="x", seg=8)

    # ------------------------------------------------ swingarm, shock, chain
    for side in (-1, 1):
        k.loft([(-0.13, 0.37, 0.47, 0.024, 2.6, 2.6, 0.5, 1, 1, side * 0.122), (-0.3, 0.34, 0.43, 0.022, 2.6, 2.6, 0.5, 1, 1, side * 0.125),
                (-0.62, 0.29, 0.35, 0.018, 2.6, 2.6, 0.5, 1, 1, side * 0.128), (-0.77, 0.29, 0.34, 0.018, 2.6, 2.6, 0.5, 1, 1, side * 0.128)],
               "dark_metal", ring=seg(12, 8), steps=2)
        k.box((0.02, 0.05, 0.06), (side * 0.142, REAR[1], REAR[2]), "silver", bevel=0.005)
    k.box((0.25, 0.06, 0.07), (0, 0.4, -0.25), "dark_metal", bevel=0.01)
    k.rod((-0.15, 0.42, -0.13), (0.15, 0.42, -0.13), 0.018, "steel_dark", seg=8)
    parts.shock(k, (0, 0.66, -0.18), (0, 0.38, -0.28), 0.03, mat="steel_dark")
    kb.chain_drive(k, -0.1, (0.33, -0.06), (REAR[1], REAR[2]), 0.04, 0.11, sprocket=False)
    kb.caliper(k, (0.094, REAR[1], REAR[2]), DISC_REAR, 145, mat="caliper", length=0.085, radial=0.045, width=0.05, pistons=1, mount=(0.125, 0.36, -0.5))
    if not low:
        k.box((0.008, 0.03, 0.3), (-0.115, 0.42, -0.45), "dark_metal", rot=(0.15, 0, 0), bevel=0.003)
        k.box((0.06, 0.08, 0.08), (-0.11, 0.34, -0.05), "dark_metal", bevel=0.01)

    # ------------------------------------------------ pegs, stand
    parts.pegs(k, PEG, mat="steel")
    for side in (-1, 1):
        k.rod((side * 0.14, 0.44, -0.38), (side * 0.2, 0.44, -0.4), 0.011, "steel", seg=8)
        k.panel([(-0.3, 0.62), (-0.36, 0.6), (-0.42, 0.42), (-0.36, 0.42)], side * 0.135, 0.012, "silver", bevel=0.003)
    k.rod((-0.15, 0.33, -0.06), (-0.27, 0.03, 0.04), 0.011, "steel_dark", seg=6)


def luggage(k):
    # The black dry duffel lying across the pillion on every trip, squarish,
    # roll-top ends with clips, two compression straps over it
    z = -0.53
    k.begin("luggage", (0, 1.03, z))
    path = [(x, 1.03, z) for x in (-0.27, -0.14, 0.0, 0.14, 0.27)]
    kb.duffel(k, path, 0.13, 0.165, mat="bag", strap="trim", straps=(0.28, 0.72), power=3.4, pocket=(0.5, 0.26),
              anchors=[((s * 0.16, 0.95, z + 0.1), (s * 0.13, 0.84, -0.42)) for s in (-1, 1)] + [((s * 0.16, 0.95, z - 0.1), (s * 0.13, 0.85, -0.62)) for s in (-1, 1)])


def full(k):
    build(k)
    luggage(k)


kb.make(NAME, full, colours={"paint": BLACK, "caliper": 0x232428, "disc": 0xB4B7BC}, anchors={"grip": GRIP, "peg": PEG})
