# bike-13: Steve's red twin-cylinder supersport, from his photos at the
# Whipsnade viewpoint: a full red fairing with a sharp nose, a slim LED
# headlight in each of the two nose intakes, a short smoked screen, gold
# upside-down forks, twin front discs with radial calipers, black 5-split
# spoke wheels, a black hugger and front mudguard, a single-sided swingarm
# on the left (the right of the rear wheel bare but for its centre nut), an
# underbelly silencer with twin tips on the right, a sharp upswept tail
# with its lights tucked under the tip, a tank-bag ring on the tank (no bag:
# no photo shows one on), and a small black tail pack on the pillion seat.
# No badges, no plate.
#
# Colour schemes: "red" is Steve's bike in the photos; "track" is the same
# bike in gloss black as a track bike (Lucy's): dark grey where the red one
# is black, and no road parts. It has no mirrors, no plate or its hanger, no
# indicators, no luggage or tank-bag ring, a painted cowl in place of the
# pillion pad, and dark covers where the headlights were. Its file has no
# `headlight` node, like the dirt bike's, so the game lights nothing there.
#
# Real size (the 2020 model's published figures): 1,436 mm wheelbase,
# 840 mm seat, 24 degrees of rake, 120/70-17 and 180/60-17 tyres, twin
# 320 mm front discs, a 245 mm rear disc.
#   blender --background --factory-startup --python tools/blender/bikes/bike13_panigale.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_E as E  # noqa: E402
import bike_parts as parts  # noqa: E402

NAME = "bike13_panigale"
FRONT, REAR = (0, 0.300, 0.718), (0, 0.324, -0.718)
FRONT_R, REAR_R = 0.300, 0.324
RIM = 0.216
RAKE = math.radians(24.0)
FORK_LEN = 0.72
TOP = (FRONT[1] + FORK_LEN * math.cos(RAKE), FRONT[2] - FORK_LEN * math.sin(RAKE))
FORK_X = 0.105
DISC_X, DISC_R = 0.07, 0.16
# The rear disc is on the left, inboard of the swingarm (the rider's left is -x as written)
RDISC_X, RDISC_R = -0.07, 0.1225
GRIP = (0.29, 0.872, 0.42)
PEG = (0.17, 0.40, -0.25)
SEAT = (0, 0.84, -0.16)
# Swingarm pivot (y, z)
PIVOT = (0.42, -0.16)
ARM_X = -0.105

COLOURS = {"paint": 0xC8102E, "paint_dark": 0x1A1A1E, "accent": 0x1C1C20, "rim": 0x141416, "caliper": 0xB8923A, "fork_gold": 0xC9A043,
           "spring": 0x34363A, "luggage": 0x16171A, "trim": 0x161618, "glass": 0x23272C}
SCHEMES = {
    "red": COLOURS,
    "track": {**COLOURS, "paint": 0x0E0E10, "trim": 0x383B40, "accent": 0x383B40},
}
# The scheme being built, and whether it is the track bike (set by build)
scheme = "red"
track = False
EXTRA = {
    # Cast aluminium of the swingarm and the rearsets
    "alu": (0x8E9196, 0.36, 0.9),
    # The engine's dark grey castings
    "casing": (0x2A2B2E, 0.5, 0.6),
    # The inner fork tubes' dark coating
    "fork_inner": (0x3A3530, 0.2, 0.9),
}


def wheels(k):
    k.begin("wheel_front", FRONT)
    E.wheel(k, FRONT, FRONT_R, 0.12, RIM, spokes="cast", count=5, pair=True, hub=0.048, sweep=0.06, hub_width=0.045, blade=1.6)
    k.begin("wheel_rear", REAR)
    E.wheel(k, REAR, REAR_R, 0.18, RIM, spokes="cast", count=5, pair=True, hub=0.055, sweep=0.06, hub_width=0.05, blade=1.7)
    # The bare right face: a big centre nut and its washer on the axle
    k.lathe([(0, 0), (0.05, 0), (0.05, 0.012), (0.038, 0.02), (0.038, 0.045), (0, 0.045)], (0.05, REAR[1], REAR[2]), "steel_dark", axis="x",
            rot=(0, 0, math.pi), seg=6 if k.low else 12, sharp=30)
    k.cylinder(0.028, 0.01, (0.1, REAR[1], REAR[2]), "dark_metal", axis="x", seg=12)
    # Sprocket on the left, outboard of the swingarm hub
    parts.sprocket(k, REAR, -0.15, 0.098)
    k.begin("disc_front", (DISC_X, FRONT[1], FRONT[2]))
    k.disc((DISC_X, FRONT[1], FRONT[2]), DISC_R, arms=6)
    k.disc((-DISC_X, FRONT[1], FRONT[2]), DISC_R, arms=6)
    k.begin("disc_rear", (RDISC_X, REAR[1], REAR[2]))
    k.disc((RDISC_X, REAR[1], REAR[2]), RDISC_R, arms=5)


def front_end(k):
    axle = (FRONT[1], FRONT[2])
    mid = E.along(axle, TOP, 0.5)
    for side, name in ((-1, "fork_left"), (1, "fork_right")):
        k.begin(name, (side * FORK_X, mid[0], mid[1]))
        E.usd_fork(k, side, axle, TOP, 0.026, 0.0215, "fork_gold", inner_mat="fork_inner", x=FORK_X, disc=(DISC_X, DISC_R),
                   caliper_angle=math.radians(207), caliper_size=(0.05, 0.062, 0.13), adjuster="fork_gold", split=0.2)
        # Clip-on clamp round the fork tube under the top yoke
        a = (side * FORK_X, axle[0], axle[1])
        b = (side * FORK_X, TOP[0], TOP[1])
        k.rod(E.along(a, b, 0.86), E.along(a, b, 0.92), 0.036, "dark_metal", seg=12)
    k.begin("body")
    E.yokes(k, FORK_X, axle, TOP, 0.09)
    # Black front mudguard, close over the tyre, with a fin each side to the fork feet
    k.guard((FRONT[1], FRONT[2]), FRONT_R + 0.014, 0.13, math.radians(25), math.radians(145), "trim", crown=0.02, nu=14)
    for side in (-1, 1):
        k.panel([(0.80, 0.42), (0.77, 0.54), (0.64, 0.6), (0.6, 0.5), (0.68, 0.43)], side * 0.058, 0.006, "trim", bevel=0.002)

    k.begin("handlebar", (0, GRIP[1], GRIP[2] + 0.04))
    for side in (-1, 1):
        g = (side * GRIP[0], GRIP[1], GRIP[2])
        root = (side * (FORK_X + 0.035), GRIP[1] + 0.012, GRIP[2] + 0.045)
        k.tube([root, E.along(root, g, 0.5), (side * (GRIP[0] + 0.07), GRIP[1] - 0.012, GRIP[2] - 0.012)], 0.011, "dark_metal", seg=8)
        E.lever_set(k, GRIP, side, FORK_X + 0.04)
    # Top yoke's steering damper and the key barrel
    k.cylinder(0.014, 0.12, (0.0, TOP[0] + 0.02, TOP[1] - 0.06), "dark_metal", axis="x", seg=8)

    # Two slim LED lights, one deep in each nose intake, with the running
    # light along the top of each
    if track:
        # A track fairing has a cover where each light was
        k.begin("body")
        for side in (-1, 1):
            k.box((0.085, 0.03, 0.012), (side * 0.048, 0.752, 0.945), "trim", rot=(-0.05, side * 0.55, side * -0.05), bevel=0.004)
    else:
        k.begin("headlight", (0, 0.755, 0.94))
        for side in (-1, 1):
            k.box((0.075, 0.014, 0.012), (side * 0.048, 0.757, 0.943), "headlight", rot=(-0.05, side * 0.55, side * -0.05), bevel=0.004)

    k.begin("brake_light", (0, 0.955, -0.89))
    for side in (-1, 1):
        k.box((0.045, 0.009, 0.03), (side * 0.022, 0.957, -0.89), "brake", rot=(0.45, side * -0.55, 0), bevel=0.003)


# The side view, traced from the real bike's hard points (wheelbase 1,436 mm,
# 2.11 m long, 1.10 m to the screen top, 840 mm seat): each body loft takes
# its upper and lower edges from these lines, (z, y), front to rear.
#   SHELL: the nose and the tank as one skin, (z, lower edge, upper edge, half-width)
SHELL = [
    (0.985, 0.795, 0.815, 0.012),
    (0.96, 0.775, 0.835, 0.05),
    (0.92, 0.755, 0.865, 0.09),
    (0.85, 0.725, 0.905, 0.12),
    (0.75, 0.705, 0.94, 0.155),
    (0.62, 0.7, 0.965, 0.18),
    (0.5, 0.71, 0.99, 0.2),
    (0.38, 0.74, 1.025, 0.195),
    (0.25, 0.76, 1.045, 0.19),
    (0.12, 0.76, 1.02, 0.175),
    (0.02, 0.77, 0.955, 0.15),
    (-0.06, 0.79, 0.875, 0.12),
]
#   TAIL: the blade from under the seat to the tip
TAIL = [
    (-0.04, 0.79, 0.83, 0.13),
    (-0.2, 0.75, 0.83, 0.15),
    (-0.33, 0.76, 0.85, 0.15),
    (-0.48, 0.82, 0.9, 0.13),
    (-0.64, 0.875, 0.935, 0.1),
    (-0.8, 0.92, 0.965, 0.065),
    (-0.92, 0.955, 0.985, 0.03),
    (-0.97, 0.97, 0.982, 0.006),
]
#   The side shell's outline and how wide the body is along its length
SIDE_TOP = [(0.9, 0.79), (0.75, 0.8), (0.6, 0.81), (0.45, 0.835), (0.3, 0.86), (0.15, 0.86), (0.02, 0.84), (-0.08, 0.81)]
SIDE_REAR = [(-0.08, 0.81), (-0.13, 0.65), (-0.15, 0.45), (-0.14, 0.27)]
SIDE_BOTTOM = [(0.45, 0.36), (0.36, 0.26), (0.2, 0.22), (0.02, 0.22), (-0.14, 0.27)]
SIDE_FRONT = [(0.9, 0.79), (0.82, 0.7), (0.68, 0.6), (0.55, 0.48), (0.45, 0.36)]
WIDTH = [(1.0, 0.04), (0.9, 0.08), (0.75, 0.15), (0.6, 0.18), (0.45, 0.205), (0.3, 0.2), (0.15, 0.185), (0.02, 0.15), (-0.08, 0.13), (-0.2, 0.13)]


def clamp(t):
    return min(1.0, max(0.0, t))


def width(z):
    for (z0, w0), (z1, w1) in zip(WIDTH, WIDTH[1:]):
        if z1 <= z <= z0:
            t = (z - z0) / (z1 - z0)
            # Smoothstep between knots, so the shell has no kinks
            t = t * t * (3 - 2 * t)
            return w0 + (w1 - w0) * t
    return WIDTH[0][1] if z > WIDTH[0][0] else WIDTH[-1][1]


def side_x(z, y):
    """How far out the side shell stands: the body's width at that length, bellied at mid
    height, tucked in toward the belly pan and a little under the shell at the top."""
    t = clamp((y - 0.22) / 0.62)
    return width(z) * (0.78 + 0.22 * math.sin(math.pi * (0.1 + 0.75 * t)))


def fairing(k):
    k.begin("body")

    # Nose and tank as one skin: a low sharp point that widens and climbs to
    # the screen, then the tank's hump right behind it, falling to the seat
    k.loft([(z, lo, hi, w, 2.4, 3.0, 0.45, 0.82) for z, lo, hi, w in SHELL], lambda u, up, side: "trim" if up < -0.75 else "paint", ring=30, steps=3,
           sharp=40)
    # Under the point, the two intakes: a dark mouth across the face, split
    # by a red fin, a slim light along the top of each
    k.loft([(0.82, 0.7, 0.77, 0.1, 3, 3), (0.9, 0.7, 0.77, 0.09, 3, 3), (0.95, 0.71, 0.765, 0.06, 3, 3), (0.965, 0.715, 0.76, 0.03)], "vent", ring=14, steps=2)
    k.box((0.02, 0.06, 0.1), (0, 0.735, 0.915), "paint", bevel=0.006)
    # The tank-bag ring round the filler cap
    if not track:
        k.cylinder(0.055, 0.012, (0, 1.045, 0.22), "dark_metal", rot=(-0.1, 0, 0), seg=16)

    # Side shell: a large curved panel each side covering the engine from
    # the nose's underside down to the belly pan, tucked in at the knee;
    # an upper layer standing proud over its top front with a dark gap
    # under its sharp edge; the radiator vent along the front edge
    for side in (-1, 1):
        E.coons(k, SIDE_TOP, SIDE_BOTTOM, SIDE_FRONT, SIDE_REAR, lambda u, v, z, y, side=side: side * side_x(z, y), "paint", nu=28, nv=18, thick=0.008,
                sharp=25)
        E.band(k, [(0.88, 0.79), (0.75, 0.8), (0.6, 0.81), (0.45, 0.835), (0.3, 0.86), (0.15, 0.858), (0.06, 0.845)],
               [(0.8, 0.705), (0.66, 0.71), (0.5, 0.7), (0.35, 0.685), (0.22, 0.67), (0.12, 0.665), (0.06, 0.67)], side_x, side, "paint", nu=18, nv=4,
               lift=0.014, thick=0.012, sharp=25)
        E.band(k, [(0.8, 0.707), (0.66, 0.712), (0.5, 0.702), (0.35, 0.687), (0.22, 0.672), (0.12, 0.667)],
               [(0.79, 0.68), (0.66, 0.685), (0.5, 0.675), (0.35, 0.662), (0.22, 0.65), (0.12, 0.648)], side_x, side, "vent", nu=12, lift=0.009)
        E.band(k, [(0.72, 0.63), (0.62, 0.55), (0.55, 0.47), (0.5, 0.4)], [(0.64, 0.64), (0.55, 0.555), (0.49, 0.47), (0.45, 0.4)], side_x, side, "vent", nu=8)
        E.band(k, [(0.68, 0.61), (0.6, 0.55), (0.54, 0.48)], [(0.645, 0.615), (0.565, 0.555), (0.51, 0.48)], side_x, side, "steel", nu=6, lift=0.011)
        E.band(k, [(0.44, 0.37), (0.36, 0.275), (0.2, 0.235), (0.02, 0.235), (-0.13, 0.285)], [(0.45, 0.36), (0.36, 0.26), (0.2, 0.22), (0.02, 0.22), (-0.14, 0.27)],
               side_x, side, "trim", nu=10, lift=0.007)
    # Belly pan closing the shells' lower edges
    k.loft([(-0.14, 0.24, 0.3, 0.1, 3, 3), (0.0, 0.215, 0.29, 0.15, 3, 3), (0.2, 0.215, 0.29, 0.15, 3, 3), (0.36, 0.26, 0.33, 0.13, 3, 3), (0.44, 0.34, 0.4, 0.08)],
           "trim", ring=14, steps=2)
    # Radiator behind the front wheel
    k.box((0.3, 0.3, 0.05), (0, 0.55, 0.44), "dark_metal", rot=(-0.3, 0, 0), bevel=0.01)

    # Short, steep smoked screen on the shell's top edge
    def screen(u, v):
        across = (v - 0.5) * 2
        half = 0.165 - 0.07 * u
        return (across * half, 0.925 + 0.195 * u - 0.025 * across * across, 0.71 - 0.21 * u - 0.03 * across * across)

    k.sheet(screen, "glass", nu=6, nv=8, thick=0.005)
    k.box((0.16, 0.1, 0.03), (0, 1.0, 0.56), "dark_metal", rot=(-0.9, 0, 0), bevel=0.01)
    k.box((0.13, 0.075, 0.004), (0, 1.01, 0.548), "dash", rot=(-0.9, 0, 0), bevel=0)
    # Mirrors out on the fairing, each with its indicator along the outer edge
    for side in (() if track else (-1, 1)):
        root = (side * 0.16, 0.92, 0.67)
        head = (side * 0.27, 1.06, 0.63)
        k.tube([root, E.along(root, head, 0.5), head], 0.009, "trim", seg=6, smooth=2)
        c = side * 0.29
        k.loft([(0.6, 1.03, 1.09, 0.04, 2.4, 2.4, 0.5, 1, 1, c), (0.62, 1.018, 1.102, 0.075, 3.2, 3.2, 0.5, 1, 1, c),
                (0.65, 1.022, 1.098, 0.07, 3.2, 3.2, 0.5, 1, 1, c), (0.665, 1.035, 1.085, 0.05, 2.4, 2.4, 0.5, 1, 1, c)], "trim", ring=12, steps=1)
        k.box((0.1, 0.012, 0.01), (side * 0.3, 1.055, 0.668), "signal", rot=(0, 0, side * 0.08), bevel=0.003)
        k.box((0.13, 0.06, 0.004), (side * 0.29, 1.06, 0.599), "chrome", bevel=0)


def tank_and_tail(k):
    k.begin("body")
    # Dark frame and airbox under the seat, filling the gap above the shock
    for side in (-1, 1):
        E.panel(k, [(-0.04, 0.8), (-0.3, 0.78), (-0.32, 0.66), (-0.12, 0.6)], side * 0.1, 0.02, "dark_metal")
    # The rider's seat, very short and low, then the pillion pad on the blade
    k.loft([(0.0, 0.825, 0.855, 0.1), (-0.05, 0.815, 0.86, 0.15, 3, 3), (-0.25, 0.815, 0.855, 0.155, 3, 3), (-0.33, 0.83, 0.87, 0.13)], "seat", ring=16, steps=2)
    k.loft([(-0.4, 0.875, 0.9, 0.07), (-0.44, 0.88, 0.92, 0.1, 3, 3), (-0.58, 0.905, 0.945, 0.085, 3, 3), (-0.64, 0.915, 0.95, 0.05)], "paint" if track else "seat", ring=12, steps=2)

    # Tail: a slim pointed blade rising to the tip, red over black, with an
    # open gap under it to the tyre; the lights tucked under the tip
    k.loft([(z, lo, hi, w, 3.0, 2.6, 0.55, 0.75) for z, lo, hi, w in TAIL], lambda u, up, side: "trim" if up < -0.55 else "paint", ring=22, steps=3, sharp=30)
    for side in (-1, 1):
        E.panel(k, [(-0.38, 0.83), (-0.62, 0.9), (-0.66, 0.89), (-0.42, 0.815)], side * 0.128, 0.01, "vent", toe=side * 0.18, bevel=0.002)
    # Short plate hanger tucked under the blade, a blank plate, indicators
    if not track:
        k.beam((0, 0.88, -0.7), (0, 0.8, -0.8), (0.05, 0.02), "trim")
        E.plate(k, (0, 0.76, -0.81), size=(0.17, 0.12), lean=0.3)
        for side in (-1, 1):
            E.indicator(k, (side * 0.03, 0.84, -0.77), (side * 0.12, 0.845, -0.78), radius=0.009)
    # Rear hugger close over the tyre, on the swingarm
    k.guard((REAR[1], REAR[2]), REAR_R + 0.018, 0.19, math.radians(55), math.radians(125), "trim", crown=0.025, nu=8)


def engine(k):
    k.begin("body")
    # The 90-degree twin: crankcase low in the frame, the front cylinder
    # laid forward under the radiator, the rear one standing under the tank
    k.loft([(-0.17, 0.28, 0.5, 0.12, 3, 3), (-0.1, 0.24, 0.56, 0.16, 3, 3), (0.12, 0.22, 0.54, 0.16, 3, 3), (0.24, 0.26, 0.48, 0.13, 3, 3), (0.28, 0.3, 0.42, 0.1)],
           "casing", ring=14, steps=2)
    # Rear cylinder and head, finned, its cam belt cover on the right
    k.box((0.12, 0.26, 0.16), (0, 0.6, -0.04), "casing", rot=(0.12, 0, 0), bevel=0.015)
    if not k.low:
        for n in range(5):
            k.box((0.135, 0.008, 0.17), (0, 0.52 + n * 0.035, -0.04 + n * 0.004), "casing", rot=(0.12, 0, 0), bevel=0)
    k.box((0.16, 0.08, 0.17), (0, 0.76, -0.02), "dark_metal", rot=(0.12, 0, 0), bevel=0.015)
    k.box((0.02, 0.24, 0.13), (0.075, 0.6, -0.05), "dark_metal", rot=(0.12, 0, 0), bevel=0.01)
    # Front cylinder under the radiator
    k.box((0.12, 0.15, 0.26), (0, 0.44, 0.27), "casing", rot=(-0.36, 0, 0), bevel=0.015)
    # Clutch cover on the right, generator cover on the left, the sump
    k.lathe([(0, 0), (0.1, 0), (0.1, 0.02), (0.078, 0.038), (0, 0.042)], (0.16, 0.36, 0.0), "casing", axis="x", seg=20)
    k.lathe([(0, 0), (0.03, 0), (0.03, 0.01), (0, 0.01)], (0.2, 0.36, 0.0), "alu", axis="x", seg=10)
    k.lathe([(0, 0), (0.09, 0), (0.09, 0.018), (0.068, 0.034), (0, 0.036)], (-0.16, 0.37, 0.05), "casing", axis="x", rot=(0, 0, math.pi), seg=20)
    k.lathe([(0, 0), (0.05, 0), (0.05, 0.012), (0, 0.012)], (-0.195, 0.37, 0.05), "alu", axis="x", rot=(0, 0, math.pi), seg=12)
    # Front sprocket cover on the left
    k.panel([(-0.03, 0.44), (-0.12, 0.42), (-0.13, 0.32), (-0.03, 0.3)], -0.165, 0.02, "casing")

    # Exhaust: the headers run under the engine into a short silencer in
    # the belly, which ends in two stubby tips on the right, ahead of the
    # rear wheel
    for x in (-0.03, 0.04):
        k.tube([(x, 0.42, 0.38), (x, 0.3, 0.4), (x * 1.5, 0.22, 0.25), (x * 1.5, 0.2, 0.05)], 0.022, "steel_dark", seg=8, smooth=2)
    k.loft([(0.12, 0.17, 0.27, 0.1, 3, 3), (0.08, 0.15, 0.27, 0.14, 3.2, 3.2), (-0.14, 0.17, 0.3, 0.14, 3.2, 3.2), (-0.2, 0.2, 0.31, 0.11)], "dark_metal", ring=14, steps=2)
    for dy in (0.0, 0.055):
        k.tube([(0.1, 0.22 + dy, -0.16), (0.16, 0.23 + dy, -0.22), (0.19, 0.24 + dy * 1.1, -0.27)], 0.025, "steel", seg=10, smooth=2)
        k.lathe([(0.023, 0), (0.026, 0), (0.026, 0.02), (0.02, 0.02)], (0.19, 0.24 + dy * 1.1, -0.27), "dark_metal", to=(0.21, 0.245 + dy * 1.1, -0.29), seg=10)


def chassis(k):
    k.begin("body")
    # Single-sided swingarm on the left: a deep cast arm from the pivot to
    # the big hub that carries the rear axle, braced on its upper edge
    k.loft([
        (PIVOT[1] + 0.03, 0.36, 0.5, 0.03, 3, 3, 0.5, 1, 1, ARM_X + 0.01),
        (PIVOT[1] - 0.08, 0.35, 0.49, 0.03, 3, 3, 0.5, 1, 1, ARM_X),
        (-0.45, 0.3, 0.43, 0.026, 3, 3, 0.5, 1, 1, ARM_X - 0.01),
        (REAR[2] + 0.1, 0.27, 0.38, 0.026, 3, 3, 0.5, 1, 1, ARM_X - 0.015),
        (REAR[2] + 0.03, 0.27, 0.38, 0.024, 3, 3, 0.5, 1, 1, ARM_X - 0.015),
    ], "alu", ring=14, steps=2)
    # The hub (eccentric) through the arm's end
    k.lathe([(0, -0.03), (0.07, -0.03), (0.075, -0.02), (0.075, 0.02), (0.07, 0.03), (0, 0.03)], (ARM_X - 0.02, REAR[1], REAR[2]), "alu", axis="x", seg=24)
    k.lathe([(0, -0.035), (0.032, -0.035), (0.032, 0.035), (0, 0.035)], (ARM_X - 0.02, REAR[1], REAR[2]), "dark_metal", axis="x", seg=12)
    # A bridge across to the right-hand pivot
    k.box((0.24, 0.1, 0.1), (0.0, PIVOT[0], PIVOT[1] - 0.04), "alu", bevel=0.02)
    k.rod((-0.17, PIVOT[0], PIVOT[1]), (0.17, PIVOT[0], PIVOT[1]), 0.022, "dark_metal", seg=10)
    # Chain on the left, outboard of the arm
    parts.chain(k, x=-0.15, front=(0.36, -0.06, 0.04), rear=(REAR[1], REAR[2], 0.098))
    k.beam((-0.15, 0.45, -0.25), (-0.15, 0.41, -0.5), (0.008, 0.03), "trim")
    # Rear caliper under the arm on the left, gripping the disc from below
    E.caliper(k, (RDISC_X, REAR[1], REAR[2]), RDISC_R, math.radians(250), size=(0.045, 0.05, 0.085))
    k.beam((ARM_X - 0.005, REAR[1] - 0.04, REAR[2] + 0.01), (ARM_X - 0.005, REAR[1] - 0.1, REAR[2] + 0.07), (0.012, 0.035), "alu")
    # Rear shock on the left, nearly upright between the frame and the arm
    parts.shock(k, (-0.06, 0.72, -0.2), (-0.06, 0.45, -0.3), 0.03)
    # Rearsets: cast plates with the pegs, heel guards and the levers
    for side in (-1, 1):
        E.panel(k, [(-0.12, 0.52), (-0.2, 0.52), (-0.3, 0.41), (-0.26, 0.36), (-0.16, 0.4)], side * 0.15, 0.012, "alu")
    parts.pegs(k, PEG, heel=True, mat="alu")
    # Side stand on the left, folded
    k.rod((-0.15, 0.3, -0.05), (-0.17, 0.2, -0.33), 0.011, "steel", seg=6)


def luggage(k):
    k.begin("body")
    # No tank bag: no photo of the bike shows one on, only its ring (tank_and_tail)
    # Tail pack on the pillion pad: a rounded soft bag with a carry handle
    k.loft([(-0.41, 0.915, 0.94, 0.065), (-0.44, 0.91, 1.02, 0.1, 2.6, 2.4), (-0.58, 0.93, 1.035, 0.09, 2.6, 2.4), (-0.63, 0.94, 0.985, 0.06)], "luggage", ring=16,
           steps=2, sharp=60)
    k.tube([(0, 1.025, -0.46), (0, 1.055, -0.485), (0, 1.06, -0.545), (0, 1.032, -0.57)], 0.008, "dark_metal", seg=6, smooth=2)


def draw(k):
    wheels(k)
    front_end(k)
    fairing(k)
    tank_and_tail(k)
    engine(k)
    chassis(k)
    if not track:
        luggage(k)


def photo_view(k):
    """With TWISTY_PREVIEW set, also renders the bike from about where Steve's front three-quarter
    photo was taken (low, close, a wide lens, from the bike's left), on a clear background, so the
    render can be laid over the photo. TWISTY_PHOTO_EYE overrides the camera as "x,y,z"."""
    out = os.environ.get("TWISTY_PREVIEW")
    if not out:
        return
    import bpy
    from bike_kit import render
    eye = tuple(float(v) for v in os.environ.get("TWISTY_PHOTO_EYE", "1.1,1.45,2.4").split(","))
    k.show("lod0")
    render(k.scene, os.path.join(out, "bike13_panigale-photo-opaque.png"), eye, (0, 0.55, 0.12), size=(1271, 952), lens=24)
    bpy.data.objects["preview-floor"].hide_render = True
    k.scene.render.film_transparent = True
    k.scene.render.image_settings.color_mode = "RGBA"
    render(k.scene, os.path.join(out, "bike13_panigale-photo.png"), eye, (0, 0.55, 0.12), size=(1271, 952), lens=24)
    bpy.data.objects["preview-floor"].hide_render = False
    k.scene.render.film_transparent = False


def build(name, suffix):
    global scheme, track
    scheme, track = name, name == "track"
    k = E.EKit(seed=113, colours=SCHEMES[scheme], extra=EXTRA)
    for lod in E.LODS:
        k.level(lod)
        draw(k)
    k.finish_lods(os.path.join(E.OUT_DIR, NAME + suffix + ".glb"), {"grip": GRIP, "peg": PEG, "seat": SEAT})
    E.previews(k, NAME + suffix, height=0.62, reach=0.95)
    if not track:
        photo_view(k)


for name, suffix in (("red", ""), ("track", "_black")):
    build(name, suffix)
