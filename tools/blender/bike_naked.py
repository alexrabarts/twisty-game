# The naked middleweight (Lucy): a black parallel twin in a lime-green
# trellis frame, angular tank shrouds with green stripes, a sharp LED
# headlight under a small fly screen, a short upswept tail, conventional
# forks with twin petal discs, black wheels with green rim stripes and an
# underslung exhaust whose copper headers run down in front of the engine.
#
# Wheel centres, bar, pegs, seat and brake light stand where
# Vehicle.buildNakedBike puts them (js/vehicle.js).
#   blender --background --factory-startup --python tools/blender/bike_naked.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bike_parts as parts  # noqa: E402
from bike_kit import Kit  # noqa: E402
from common import ASSETS  # noqa: E402

OUT = os.path.join(ASSETS, "bikes", "naked.glb")
FRONT, REAR = (0, 0.3, 0.7), (0, 0.3, -0.7)
# Where the rider's hand and foot go (right side), as buildNakedBike poses them
GRIP = (0.3, 1.06, 0.4)
PEG = (0.2, 0.42, -0.12)
LIME = 0x9CCC1A
BLACK = 0x16181C


# A thin ring in the accent colour on the outer face of each rim lip
def rim_stripes(k, centre, rim, width):
    for side in (-1, 1):
        # Its inner face lies on the lip and is left open
        x0, x1 = side * 0.441 * width, side * 0.452 * width
        k.lathe([(rim - 0.017, x1), (rim + 0.003, x1), (rim + 0.003, x0)], centre, "accent", axis="x", seg=24, sharp=60)


def build():
    k = Kit(seed=17, colours={"paint": BLACK, "paint_dark": 0x07080A, "accent": LIME, "rim": 0x17181C, "caliper": 0x2A2C31, "spring": 0x2A2C31})

    k.begin("wheel_rear", REAR)
    k.wheel(REAR, 0.30, 0.15, 0.205, style="alloy", spokes=5)
    rim_stripes(k, REAR, 0.205, 0.15)
    parts.sprocket(k, REAR, -0.1, 0.1)
    k.begin("wheel_front", FRONT)
    k.wheel(FRONT, 0.28, 0.11, 0.2, style="alloy", spokes=5)
    rim_stripes(k, FRONT, 0.2, 0.11)
    k.begin("disc_rear", (0.09, 0.3, -0.7))
    # Inboard of the swingarm, whose inner face is at x 0.0825
    k.disc((0.072, 0.3, -0.7), 0.11)
    k.begin("disc_front", (0.09, 0.3, 0.7))
    # Inboard of the fork legs, whose inner faces are at x 0.0706
    k.disc((0.062, 0.3, 0.7), 0.145)
    k.disc((-0.062, 0.3, 0.7), 0.145)

    # Conventional forks, raked about 18 degrees, dark lowers
    parts.forks(k, x=0.1, axle=(0.3, 0.7), top=(0.97, 0.48), radius=0.021, pivot=(0.1, 0.635, 0.59), caliper_radius=0.145, twin=True, disc_x=0.062,
                lower="dark_metal")

    # A wide, flat one-piece bar on short risers
    k.begin("handlebar", (0, 1.04, 0.46))
    parts.bars(k, GRIP, clamp=(1.0, 0.47), rise=0.045, mat="dark_metal")
    parts.mirror(k, (0.17, 1.07, 0.44), (0.3, 1.24, 0.43))

    k.begin("brake_light", (0, 0.925, -0.8))
    k.box((0.1, 0.03, 0.03), (0, 0.925, -0.795), "brake", rot=(0.35, 0, 0), bevel=0.008)

    # An angular LED lamp: a wide lens with a brow over it
    k.begin("headlight", (0, 0.85, 0.72))
    k.box((0.15, 0.05, 0.02), (0, 0.845, 0.745), "headlight", rot=(-0.3, 0, 0), bevel=0.008)
    for side in (-1, 1):
        k.box((0.06, 0.016, 0.012), (side * 0.045, 0.882, 0.732), "headlight", rot=(-0.3, 0, side * 0.25), bevel=0.004)

    k.begin("body")

    # Headlight cowl: pointed in plan, the lamp set in its face, a green slash each side
    def cowl(u, up, side):
        return "accent" if (0.45 < u < 0.75 and -0.3 < up < 0.1 and abs(side) > 0.6) else "paint"

    k.loft([
        (0.56, 0.82, 0.98, 0.08),
        (0.62, 0.79, 0.98, 0.13, 3, 3),
        (0.68, 0.8, 0.96, 0.12, 3, 3, 0.5, 0.8, 0.9),
        (0.73, 0.81, 0.92, 0.09, 3, 3, 0.5, 0.75),
        (0.755, 0.82, 0.89, 0.05),
    ], cowl, ring=14, steps=2, sharp=30)

    # Small smoked fly screen over the cowl, and the dash behind it
    def screen(u, v):
        across = (v - 0.5) * 2
        half = 0.11 - 0.03 * u
        return (across * half, 0.95 + 0.11 * u, 0.7 - 0.07 * u - 0.03 * across * across)

    k.sheet(screen, "glass", nu=3, nv=4, thick=0.005)
    k.box((0.13, 0.08, 0.03), (0, 1.03, 0.56), "dark_metal", rot=(-0.6, 0, 0))
    k.box((0.1, 0.06, 0.006), (0, 1.037, 0.575), "dash", rot=(-0.6, 0, 0), bevel=0)
    k.cylinder(0.042, 0.2, (0, 0.88, 0.49), "dark_metal", rot=(-0.31, 0, 0), seg=10)

    # Tank: a tall crown that steps down to the seat
    k.loft([
        (0.47, 0.86, 0.97, 0.08),
        (0.42, 0.79, 1.01, 0.16, 2.6, 3.0),
        (0.3, 0.75, 1.045, 0.2, 2.6, 3.0, 0.45),
        (0.15, 0.74, 1.05, 0.2, 2.6, 3.0, 0.45),
        (0.02, 0.76, 1.0, 0.17, 2.6, 3.0, 0.5, 0.8),
        (-0.06, 0.8, 0.94, 0.13),
        (-0.1, 0.84, 0.9, 0.08),
    ], "paint", ring=18, steps=3)
    k.cylinder(0.032, 0.01, (0, 1.05, 0.22), "steel_dark", seg=10)

    # Shrouds: angular wings off the tank either side of the radiator, each
    # with two green stripes sweeping back
    # Turned so the front edge tucks in toward the radiator; the panel turns
    # about z = 0, so its x makes up for the swing at the shroud's middle
    toe = 0.12
    for side in (-1, 1):
        x = side * (0.168 + 0.47 * math.sin(toe))
        k.panel([(0.44, 0.96), (0.58, 0.82), (0.6, 0.7), (0.5, 0.6), (0.38, 0.62), (0.33, 0.78)], x, 0.026, "paint", toe=-side * toe)
        k.panel([(0.585, 0.79), (0.59, 0.76), (0.37, 0.67), (0.36, 0.695)], x + side * 0.016, 0.005, "accent", toe=-side * toe, bevel=0)
        k.panel([(0.5, 0.895), (0.515, 0.875), (0.35, 0.785), (0.345, 0.805)], x + side * 0.016, 0.005, "accent", toe=-side * toe, bevel=0)
    k.box((0.3, 0.24, 0.045), (0, 0.6, 0.43), "dark_metal", rot=(-0.3, 0, 0), bevel=0.01)
    k.box((0.26, 0.2, 0.01), (0, 0.6, 0.455), "vent", rot=(-0.3, 0, 0), bevel=0)

    # Seat, and a pillion pad stepped up on the tail
    k.loft([(-0.04, 0.8, 0.84, 0.1), (-0.1, 0.8, 0.855, 0.15, 3, 3), (-0.3, 0.8, 0.855, 0.145, 3, 3), (-0.4, 0.82, 0.87, 0.1, 3, 3), (-0.43, 0.84, 0.88, 0.06)],
           "seat", ring=12, steps=2)
    k.loft([(-0.42, 0.87, 0.9, 0.06), (-0.46, 0.87, 0.925, 0.1, 3, 3), (-0.6, 0.89, 0.945, 0.085, 3, 3), (-0.66, 0.91, 0.95, 0.05)], "seat", ring=10, steps=2)

    # Short tail: side panels that sweep up to a sharp point over the light,
    # a green stripe along each
    def tail(u, up, side):
        return "accent" if (0.35 < u < 0.85 and -0.2 < up < 0.05 and abs(side) > 0.5) else "paint"

    k.loft([
        (0.0, 0.66, 0.8, 0.13),
        (-0.18, 0.68, 0.83, 0.15, 3, 2.6),
        (-0.38, 0.74, 0.88, 0.13, 3, 2.6),
        (-0.58, 0.82, 0.92, 0.1, 3, 2.6),
        (-0.74, 0.87, 0.95, 0.065, 3, 2.6),
        (-0.82, 0.9, 0.95, 0.03),
    ], tail, ring=14, steps=2)
    # Tail tidy: a hanger down and back to the plate, and the indicators
    k.beam((0, 0.85, -0.7), (0, 0.64, -0.92), (0.05, 0.025), "dark_metal")
    k.box((0.16, 0.1, 0.008), (0, 0.6, -0.93), "plate", rot=(0.25, 0, 0), bevel=0)
    for side in (-1, 1):
        k.rod((side * 0.03, 0.7, -0.86), (side * 0.12, 0.71, -0.86), 0.007, "dark_metal", seg=5)
        k.box((0.035, 0.02, 0.03), (side * 0.135, 0.71, -0.86), "signal", bevel=0.006)
    k.guard((0.3, -0.7), 0.33, 0.13, math.radians(62), math.radians(132), "dark_metal", crown=0.03, nu=7)
    k.guard((0.3, 0.7), 0.31, 0.12, math.radians(32), math.radians(132), "paint", crown=0.035, nu=8)

    # Trellis frame in green: a top rail and a down rail from the headstock,
    # braced into triangles, to the plates round the swingarm pivot
    head = (0.06, 0.86, 0.46)
    top, rear, low, mid, pivot = (0.13, 0.8, 0.16), (0.14, 0.72, -0.08), (0.13, 0.56, 0.32), (0.14, 0.56, 0.04), (0.14, 0.44, -0.12)
    for side in (-1, 1):
        at = [(side * p[0], p[1], p[2]) for p in (head, top, rear, low, mid, pivot)]
        h, t, r, lo, m, pv = at
        for a, b in ((h, t), (t, r), (h, lo), (lo, t), (t, m), (m, r), (lo, m), (m, pv), (r, pv)):
            k.rod(a, b, 0.012, "accent", seg=7)
        k.panel([(-0.04, 0.56), (-0.17, 0.54), (-0.2, 0.38), (-0.1, 0.35), (-0.02, 0.42)], side * 0.15, 0.02, "dark_metal", bevel=0.006)
        # Subframe up to the tail
        k.rod(r, (side * 0.09, 0.88, -0.6), 0.011, "dark_metal", seg=6)
        k.rod((side * 0.14, 0.6, -0.14), (side * 0.09, 0.86, -0.55), 0.01, "dark_metal", seg=6)

    # Parallel twin: crankcase, the barrels leaning forward, head and covers
    k.box((0.26, 0.24, 0.36), (0, 0.36, 0.05), "dark_metal", bevel=0.02)
    k.box((0.23, 0.2, 0.17), (0, 0.55, 0.2), "dark_metal", rot=(-0.45, 0, 0), bevel=0.015)
    for n in range(3):
        k.box((0.245, 0.012, 0.18), (0, 0.5 + n * 0.045, 0.18 + n * 0.02), "steel_dark", rot=(-0.45, 0, 0), bevel=0)
    k.box((0.24, 0.08, 0.16), (0, 0.67, 0.27), "steel_dark", rot=(-0.45, 0, 0), bevel=0.015)
    for side in (-1, 1):
        k.lathe([(0, 0), (0.085, 0), (0.085, 0.02), (0.055, 0.032), (0, 0.032)], (side * 0.13, 0.37, 0.02), "steel_dark", axis="x", rot=(0, 0, 0 if side > 0 else math.pi), seg=14)
    k.box((0.2, 0.06, 0.24), (0, 0.22, 0.05), "dark_metal", bevel=0.01)

    # Exhaust: copper headers out of the head, down in front of the engine
    # and back under it into a black box silencer beneath the pivot
    for side in (-1, 1):
        k.tube([(side * 0.05, 0.63, 0.36), (side * 0.06, 0.52, 0.42), (side * 0.06, 0.36, 0.38), (side * 0.04, 0.22, 0.26), (side * 0.02, 0.17, 0.1)], 0.02, "copper", seg=8, smooth=3)
    k.loft([(0.12, 0.13, 0.22, 0.06), (0.06, 0.12, 0.25, 0.1, 3.5, 3.5), (-0.14, 0.12, 0.26, 0.11, 3.5, 3.5), (-0.24, 0.14, 0.25, 0.09, 3.5, 3.5), (-0.27, 0.15, 0.24, 0.06)],
           "dark_metal", ring=12, steps=2)
    k.cylinder(0.026, 0.03, (0.07, 0.2, -0.28), "steel", axis="z", seg=10)
    # A belly cover over the silencer each side, with a green stripe
    for side in (-1, 1):
        k.panel([(0.14, 0.27), (0.08, 0.16), (-0.22, 0.17), (-0.26, 0.24), (-0.02, 0.29)], side * 0.12, 0.012, "paint", toe=side * -0.05)
        k.panel([(0.1, 0.235), (0.08, 0.215), (-0.18, 0.21), (-0.2, 0.23)], side * 0.128, 0.004, "accent", toe=side * -0.05, bevel=0)

    # Swingarm, a laid-down shock, chain, rear caliper
    parts.swingarm(k, pivot=(0.42, -0.14), axle=(0.3, -0.7), x=0.1, size=(0.035, 0.075), mat="dark_metal")
    parts.shock(k, (0, 0.62, -0.1), (0, 0.46, -0.36), 0.03)
    parts.chain(k, x=-0.1, front=(0.4, -0.06, 0.045), rear=(0.3, -0.7, 0.1))
    parts.caliper(k, (0.072, 0.3, -0.7), 0.11, math.radians(200))

    # Pegs on hangers, and the side stand
    parts.pegs(k, PEG, hanger=(0.52, -0.1))
    k.side_stand((-0.15, 0.3, -0.02), (-0.27, 0.03, 0.06), 0.011, "steel_dark", seg=6)

    k.finish(OUT, anchors={"grip": GRIP, "peg": PEG}, budget=12000, alone=("wheel_front", "wheel_rear", "disc_front", "disc_rear"))
    parts.preview(k, "naked")


build()
