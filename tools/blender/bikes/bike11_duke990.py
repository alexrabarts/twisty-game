# bike-11: the big naked twin from the trip photos (2024 shape), orange and
# black: an angular orange tank whose wings run down over the radiator,
# each with a darker red slash and a black lower wing, a tall vertical
# split LED headlight in a black mask under a small fly screen, a black
# tubular frame, a black parallel twin, an underbelly silencer whose outlet
# shows low on the right, orange ten-spoke cast wheels, upside-down forks
# with orange caps, a short upswept tail with a grey pillion pad, a tail
# tidy with a blank plate, and the black roll bag it carried on the pillion.
#
# Real size: 1,476 mm wheelbase, 825 mm seat, 120/70-17 and 180/55-17
# tyres, twin 300 mm front discs, a 240 mm rear disc, 24.3 degrees of rake.
#   blender --background --factory-startup --python tools/blender/bikes/bike11_duke990.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_D as D  # noqa: E402
import bike_parts as parts  # noqa: E402

OUT = os.path.join(D.OUT_DIR, "bike11_duke990.glb")
FRONT, REAR = (0, 0.3, 0.738), (0, 0.315, -0.738)
FRONT_R, REAR_R = 0.3, 0.315
RAKE = math.radians(24.3)
FORK_LEN = 0.74
TOP = (FRONT[1] + FORK_LEN * math.cos(RAKE), FRONT[2] - FORK_LEN * math.sin(RAKE))
FORK_X = 0.1
DISC_X, DISC_R = 0.064, 0.15
RDISC_X, RDISC_R = 0.08, 0.12
GRIP = (0.37, 1.04, 0.33)
PEG = (0.2, 0.36, -0.12)
SEAT = (0, 0.83, -0.22)
PIVOT = (0.46, -0.15)

COLOURS = {"paint": 0xF06A12, "paint_dark": 0xB2301E, "accent": 0x1B1C20, "rim": 0xEE6614, "caliper": 0x3A3C41, "spring": 0xE8661A,
           "luggage": 0x17181B, "plate": 0xE8C22C, "trim": 0x17181B, "pillion": 0x4A4D54, "seat": 0x1E1F23}


def wheels(k):
    k.begin("wheel_front", FRONT)
    D.wheel(k, FRONT, FRONT_R, 0.12, 0.216, spokes="cast", count=10, hub=0.045, sweep=0.06)
    k.begin("wheel_rear", REAR)
    D.wheel(k, REAR, REAR_R, 0.18, 0.216, spokes="cast", count=10, hub=0.05, sweep=0.06)
    parts.sprocket(k, REAR, -0.1, 0.1)
    k.begin("disc_front", (DISC_X, FRONT[1], FRONT[2]))
    k.disc((DISC_X, FRONT[1], FRONT[2]), DISC_R, arms=6)
    k.disc((-DISC_X, FRONT[1], FRONT[2]), DISC_R, arms=6)
    k.begin("disc_rear", (RDISC_X, REAR[1], REAR[2]))
    k.disc((RDISC_X, REAR[1], REAR[2]), RDISC_R, arms=5)


def front_end(k):
    axle = (FRONT[1], FRONT[2])
    mid = D.along(axle, TOP, 0.5)
    for side, name in ((-1, "fork_left"), (1, "fork_right")):
        k.begin(name, (side * FORK_X, mid[0], mid[1]))
        D.usd_fork(k, side, axle, TOP, 0.029, 0.023, "dark_metal", inner_mat="chrome", x=FORK_X, disc=(DISC_X, DISC_R),
                   caliper_size=(0.05, 0.06, 0.11), adjuster="paint")
    k.begin("body")
    D.yokes(k, FORK_X, axle, TOP, 0.09)
    # Short black front mudguard
    k.guard((FRONT[1], FRONT[2]), FRONT_R + 0.025, 0.14, math.radians(25), math.radians(125), "trim", crown=0.03, nu=9)

    k.begin("handlebar", (0, 1.0, 0.42))
    for side in (-1, 1):
        g = (side * GRIP[0], GRIP[1], GRIP[2])
        k.tube([(0, 1.0, 0.42), (side * 0.1, 1.005, 0.42), (side * 0.25, 1.03, 0.37), D.along(g, (side * 0.45, GRIP[1], GRIP[2] - 0.02), 0.5)],
               [0.014, 0.014, 0.011, 0.011], "dark_metal", seg=8, smooth=2)
        D.lever_set(k, GRIP, side, 0.24)
        k.cylinder(0.018, 0.05, (side * 0.05, 0.98, 0.43), "steel_dark", seg=8)
    D.mirror(k, (0.24, 1.04, 0.38), (0.33, 1.22, 0.36), size=(0.07, 0.035))

    # The vertical split lamp: two tall lenses side by side, a lit edge on each
    k.begin("headlight", (0, 0.86, 0.744))
    for side in (-1, 1):
        k.box((0.032, 0.17, 0.01), (side * 0.022, 0.86, 0.744), "headlight", rot=(-0.12, 0, side * -0.05), bevel=0.004)
        k.box((0.008, 0.19, 0.008), (side * 0.05, 0.862, 0.741), "headlight", rot=(-0.12, 0, side * -0.05), bevel=0.002)

    k.begin("brake_light", (0, 0.945, -0.93))
    k.box((0.08, 0.022, 0.03), (0, 0.945, -0.93), "brake", rot=(0.5, 0, 0), bevel=0.008)


def bodywork(k):
    k.begin("body")
    # Black mask round the lamp, pointed at the bottom, and the fly screen above
    k.loft([(0.58, 0.74, 1.0, 0.11, 5.0, 1.8), (0.68, 0.71, 1.0, 0.1, 6.0, 1.6, 0.55), (0.735, 0.72, 0.99, 0.09, 6.0, 1.5, 0.55), (0.742, 0.73, 0.98, 0.082, 6.0, 1.5, 0.55)],
           "trim", ring=24, steps=2, sharp=35)

    def screen(u, v):
        across = (v - 0.5) * 2
        half = 0.1 - 0.035 * u
        return (across * half, 0.97 + 0.09 * u, 0.735 - 0.08 * u - 0.03 * across * across)

    k.sheet(screen, "glass", nu=3, nv=4, thick=0.005)
    k.box((0.17, 0.11, 0.03), (0, 1.0, 0.57), "dark_metal", rot=(-0.6, 0, 0), bevel=0.01)
    k.box((0.14, 0.08, 0.006), (0, 1.007, 0.583), "dash", rot=(-0.6, 0, 0), bevel=0)
    for side in (-1, 1):
        D.indicator(k, (side * 0.06, 0.8, 0.7), (side * 0.12, 0.79, 0.71), radius=0.01)

    # Tank: angular, high at the front, a black cover over its nose
    k.loft([
        (-0.04, 0.8, 0.87, 0.1),
        (0.04, 0.78, 0.94, 0.16, 3.4, 3.4),
        (0.16, 0.76, 1.0, 0.19, 3.8, 3.6, 0.5, 0.78),
        (0.3, 0.78, 1.01, 0.19, 3.8, 3.6, 0.5, 0.78),
        (0.4, 0.82, 0.99, 0.16, 3.4, 3.4, 0.5, 0.8),
        (0.47, 0.86, 0.96, 0.1),
    ], "paint", ring=24, steps=3, sharp=30)
    k.box((0.2, 0.04, 0.17), (0, 0.995, 0.38), "trim", rot=(-0.2, 0, 0), bevel=0.012)
    k.cylinder(0.035, 0.01, (0, 1.012, 0.2), "steel_dark", seg=12)

    # Wings off the tank over the radiator: orange, a red slash, black below
    for side in (-1, 1):
        x = side * 0.2
        D.panel(k, [(0.42, 0.98), (0.62, 0.86), (0.66, 0.7), (0.58, 0.6), (0.3, 0.62), (0.22, 0.76), (0.25, 0.9)], x, 0.018, "paint", toe=side * 0.12)
        D.panel(k, [(0.62, 0.65), (0.63, 0.72), (0.3, 0.83), (0.24, 0.75), (0.32, 0.65)], x + side * 0.011, 0.005, "paint_dark", toe=side * 0.12, bevel=0.002)
        D.panel(k, [(0.6, 0.63), (0.63, 0.5), (0.5, 0.43), (0.38, 0.48), (0.46, 0.57)], side * 0.185, 0.02, "trim", toe=side * 0.12)
    k.box((0.36, 0.3, 0.05), (0, 0.65, 0.47), "dark_metal", rot=(-0.3, 0, 0), bevel=0.01)
    k.box((0.32, 0.26, 0.01), (0, 0.65, 0.497), "vent", rot=(-0.3, 0, 0), bevel=0)

    # Seat, the grey pillion pad stepped up behind, and the sharp tail
    k.loft([(0.0, 0.79, 0.86, 0.11), (-0.08, 0.785, 0.84, 0.16, 3, 3), (-0.32, 0.795, 0.84, 0.15, 3, 3), (-0.43, 0.815, 0.86, 0.1)], "seat", ring=14, steps=2)
    k.loft([(-0.42, 0.85, 0.895, 0.09), (-0.48, 0.855, 0.92, 0.12, 3, 3), (-0.66, 0.87, 0.93, 0.095, 3, 3), (-0.73, 0.89, 0.93, 0.05)], "pillion", ring=12, steps=2)

    def tail(u, up, side):
        return "paint_dark" if (abs(side) > 0.6 and 0.2 < u < 0.7 and -0.1 < up < 0.25) else "trim"

    k.loft([(-0.15, 0.66, 0.8, 0.14), (-0.4, 0.71, 0.86, 0.13, 3, 2.6), (-0.65, 0.8, 0.92, 0.1, 3, 2.6), (-0.86, 0.9, 0.97, 0.05, 3, 2.6),
            (-0.95, 0.95, 0.975, 0.015)], tail, ring=14, steps=2, sharp=30)
    # Tail tidy: a hanger down and back to the plate, the indicators
    k.beam((0, 0.88, -0.84), (0, 0.72, -1.0), (0.06, 0.022), "trim")
    D.plate(k, (0, 0.65, -1.0), size=(0.2, 0.15), lean=0.32)
    for side in (-1, 1):
        D.indicator(k, (side * 0.03, 0.76, -0.93), (side * 0.13, 0.765, -0.935), radius=0.01)
    k.guard((REAR[1], REAR[2]), REAR_R + 0.03, 0.19, math.radians(70), math.radians(120), "trim", crown=0.03, nu=6)


def frame(k):
    k.begin("body")
    # Black tubular steel frame from the headstock to the pivot, a cast
    # grey subframe under the seat
    k.cylinder(0.04, 0.18, (0, 0.9, 0.42), "dark_metal", rot=(-RAKE, 0, 0), seg=12)
    for side in (-1, 1):
        k.tube([(side * 0.04, 0.93, 0.4), (side * 0.13, 0.8, 0.18), (side * 0.14, 0.66, -0.04), (side * 0.13, 0.52, -0.15)], 0.02, "dark_metal", seg=8, smooth=2)
        k.tube([(side * 0.04, 0.86, 0.42), (side * 0.11, 0.66, 0.36), (side * 0.12, 0.5, 0.26)], 0.017, "dark_metal", seg=8, smooth=2)
        k.rod((side * 0.13, 0.8, 0.18), (side * 0.12, 0.62, 0.3), 0.013, "dark_metal", seg=6)
        k.rod((side * 0.14, 0.66, -0.04), (side * 0.12, 0.5, 0.15), 0.013, "dark_metal", seg=6)
        D.panel(k, [(-0.06, 0.62), (-0.2, 0.58), (-0.22, 0.4), (-0.12, 0.34), (-0.04, 0.42)], side * 0.14, 0.022, "dark_metal")
        D.panel(k, [(-0.12, 0.78), (-0.62, 0.86), (-0.66, 0.81), (-0.4, 0.74), (-0.18, 0.62)], side * 0.12, 0.02, "steel_dark")
        k.rod((side * 0.13, 0.55, -0.18), (side * 0.12, 0.76, -0.42), 0.012, "steel_dark", seg=6)


def engine(k):
    k.begin("body")
    # Parallel twin: crankcase, the cylinders leaning forward, the head
    k.box((0.32, 0.24, 0.44), (0, 0.37, 0.05), "dark_metal", bevel=0.03)
    k.box((0.3, 0.22, 0.18), (0, 0.57, 0.21), "dark_metal", rot=(-0.5, 0, 0), bevel=0.02)
    k.box((0.31, 0.11, 0.17), (0, 0.7, 0.29), "steel_dark", rot=(-0.5, 0, 0), bevel=0.02)
    k.box((0.26, 0.05, 0.14), (0, 0.76, 0.32), "dark_metal", rot=(-0.5, 0, 0), bevel=0.012)
    k.lathe([(0, 0), (0.1, 0), (0.1, 0.02), (0.075, 0.04), (0, 0.042)], (0.16, 0.37, 0.02), "dark_metal", axis="x", seg=18)
    k.lathe([(0, 0), (0.04, 0), (0.04, 0.012), (0, 0.012)], (0.205, 0.37, 0.02), "steel", axis="x", seg=10)
    k.lathe([(0, 0), (0.09, 0), (0.09, 0.02), (0.065, 0.035), (0, 0.035)], (-0.16, 0.39, 0.12), "dark_metal", axis="x", rot=(0, 0, math.pi), seg=16)
    D.panel(k, [(-0.05, 0.47), (-0.18, 0.45), (-0.19, 0.34), (-0.05, 0.32)], -0.17, 0.02, "dark_metal")
    # Exhaust: two headers down the front, under the engine into the belly
    # silencer, its outlet low on the right ahead of the rear wheel
    for x in (-0.06, 0.06):
        k.tube([(x, 0.7, 0.37), (x * 1.1, 0.55, 0.45), (x, 0.36, 0.42), (x * 0.5 + 0.02, 0.2, 0.27), (0.03, 0.17, 0.12)], 0.022, "steel", seg=8, smooth=3)
    k.loft([(0.16, 0.12, 0.22, 0.06), (0.1, 0.11, 0.24, 0.11, 3.5, 3.5), (-0.14, 0.12, 0.26, 0.13, 3.5, 3.5), (-0.22, 0.14, 0.25, 0.12, 3.5, 3.5),
            (-0.25, 0.16, 0.24, 0.08)], "dark_metal", ring=12, steps=2)
    k.rod((0.1, 0.2, -0.2), (0.155, 0.215, -0.27), 0.035, "steel", seg=12)
    k.cylinder(0.026, 0.012, (0.16, 0.217, -0.276), "dark_metal", axis="z", rot=(0, 0.6, 0), seg=10)


def chassis(k):
    k.begin("body")
    for side in (-1, 1):
        k.loft([(PIVOT[1] + 0.02, 0.41, 0.51, 0.022, 3, 3, 0.5, 1, 1, side * 0.115), (PIVOT[1] - 0.15, 0.39, 0.49, 0.022, 3, 3, 0.5, 1, 1, side * 0.118),
                (REAR[2] + 0.02, 0.29, 0.345, 0.02, 3, 3, 0.5, 1, 1, side * 0.115), (REAR[2] - 0.05, 0.295, 0.335, 0.018, 3, 3, 0.5, 1, 1, side * 0.115)],
               "dark_metal", ring=10, steps=2)
        k.box((0.02, 0.045, 0.07), (side * 0.13, REAR[1], REAR[2]), "steel", bevel=0.006)
    k.box((0.23, 0.05, 0.08), (0, 0.45, PIVOT[1] - 0.14), "dark_metal", bevel=0.012)
    k.rod((-0.16, PIVOT[0], PIVOT[1]), (0.16, PIVOT[0], PIVOT[1]), 0.02, "steel_dark", seg=10)
    k.rod((-0.14, REAR[1], REAR[2]), (0.14, REAR[1], REAR[2]), 0.012, "steel", seg=8)
    parts.chain(k, x=-0.1, front=(0.4, -0.06, 0.045), rear=(REAR[1], REAR[2], 0.1))
    parts.shock(k, (0.0, 0.72, -0.18), (0.0, 0.42, -0.32), 0.032)
    D.caliper(k, (RDISC_X, REAR[1], REAR[2]), RDISC_R, math.radians(205), size=(0.045, 0.055, 0.09))
    parts.pegs(k, PEG, hanger=(0.52, -0.12), wide=0.055)
    k.rod((-0.15, 0.28, -0.06), (-0.29, 0.03, 0.05), 0.012, "steel_dark", seg=6)


def luggage(k):
    k.begin("body")
    D.roll_bag(k, (0, 1.06, -0.6), 0.48, 0.145, mat="luggage", strap="dark_metal")


def draw(k):
    wheels(k)
    front_end(k)
    bodywork(k)
    frame(k)
    engine(k)
    chassis(k)
    luggage(k)


def build():
    k = D.DKit(seed=111, colours=COLOURS)
    for lod in D.LODS:
        k.level(lod)
        draw(k)
    k.finish_lods(OUT, {"grip": GRIP, "peg": PEG, "seat": SEAT})
    D.previews(k, "bike11_duke990", height=0.6)


build()
