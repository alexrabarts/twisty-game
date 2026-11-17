# bike-10: the middleweight rally adventure bike from the trip photos, in
# matt khaki-grey with a dark wedge and a pale stripe on the tank, black
# radiator shrouds with a pale flash, gold upside-down forks, a 21-inch
# spoked front wheel and a 17-inch spoked rear (black rims), twin LED
# headlights under a tall screen, a sharp beak, silver crash bars and sump
# guard, a black inline triple, a silver bolt-on subframe, an angled
# brushed silencer on the right, hand guards, and the luggage it carried:
# a black top box with an aluminium lid on a rack and a black roll bag on
# the pillion seat.
#
# Real size: 1,556 mm wheelbase, 860 mm seat, 90/90-21 and 150/70-17 tyres,
# twin 320 mm front discs, a 255 mm rear disc, 24.4 degrees of rake.
#   blender --background --factory-startup --python tools/blender/bikes/bike10_tiger900.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_D as D  # noqa: E402
import bike_parts as parts  # noqa: E402

OUT = os.path.join(D.OUT_DIR, "bike10_tiger900.glb")
FRONT, REAR = (0, 0.348, 0.778), (0, 0.321, -0.778)
FRONT_R, REAR_R = 0.348, 0.321
RAKE = math.radians(24.4)
FORK_LEN = 0.80
TOP = (FRONT[1] + FORK_LEN * math.cos(RAKE), FRONT[2] - FORK_LEN * math.sin(RAKE))
FORK_X = 0.105
DISC_X, DISC_R = 0.068, 0.159
RDISC_X, RDISC_R = 0.08, 0.1275
GRIP = (0.36, 1.17, 0.33)
PEG = (0.2, 0.36, -0.08)
SEAT = (0, 0.87, -0.2)
PIVOT = (0.47, -0.17)

TANK = [
    (-0.06, 0.84, 0.94, 0.11),
    (0.04, 0.78, 1.02, 0.185, 3.6, 3.6),
    (0.2, 0.75, 1.08, 0.215, 4.0, 4.0, 0.5, 0.86),
    (0.35, 0.76, 1.1, 0.21, 4.0, 4.0, 0.5, 0.84),
    (0.5, 0.8, 1.1, 0.19, 4.0, 4.0, 0.5, 0.8),
    (0.6, 0.84, 1.12, 0.17, 3.6, 3.4, 0.5, 0.8),
    (0.68, 0.86, 1.09, 0.15, 3.4, 3.0, 0.5, 0.8),
    (0.74, 0.88, 1.04, 0.12, 3.2, 3.0, 0.45),
    (0.765, 0.9, 1.0, 0.07),
]

COLOURS = {"paint": 0xA9A28F, "paint_dark": 0x3A3B3E, "accent": 0xD6D6D2, "rim": 0x17171A, "caliper": 0x5C6066, "fork_gold": 0xC69C3E,
           "spring": 0x2A2B2E, "luggage": 0x1A1B1E, "plate": 0xE8C22C, "trim": 0x1B1C1F}


def wheels(k):
    k.begin("wheel_front", FRONT)
    D.wheel(k, FRONT, FRONT_R, 0.092, 0.2667, spokes="wire", count=32, hub=0.05)
    k.begin("wheel_rear", REAR)
    D.wheel(k, REAR, REAR_R, 0.152, 0.216, spokes="wire", count=32, hub=0.055)
    parts.sprocket(k, REAR, -0.095, 0.105)
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
        D.usd_fork(k, side, axle, TOP, 0.03, 0.024, "fork_gold", inner_mat="chrome", x=FORK_X, disc=(DISC_X, DISC_R),
                   caliper_size=(0.05, 0.062, 0.115), adjuster="fork_gold")
    k.begin("body")
    D.yokes(k, FORK_X, axle, TOP, 0.1)
    # Low front mudguard on the fork lowers: black, a pale plate each side
    k.guard((FRONT[1], FRONT[2]), FRONT_R + 0.035, 0.13, math.radians(28), math.radians(128), "trim", crown=0.03, nu=10)
    for side in (-1, 1):
        k.panel([(0.92, 0.55), (0.98, 0.45), (0.9, 0.42), (0.78, 0.5), (0.76, 0.6)], side * 0.15, 0.008, "accent", bevel=0.003)

    k.begin("handlebar", (0, 1.15, 0.43))
    for side in (-1, 1):
        g = (side * GRIP[0], GRIP[1], GRIP[2])
        k.tube([(0, 1.15, 0.43), (side * 0.1, 1.155, 0.43), (side * 0.24, 1.165, 0.385), (side * 0.3, 1.17, 0.35), D.along(g, (side * 0.45, GRIP[1], GRIP[2] - 0.02), 0.5)],
               [0.014, 0.014, 0.012, 0.011, 0.011], "dark_metal", seg=8, smooth=2)
        D.lever_set(k, GRIP, side, 0.24)
        D.hand_guard(k, GRIP, side, mat="trim")
        k.cylinder(0.018, 0.06, (side * 0.05, 1.12, 0.44), "steel_dark", seg=8)
    k.box((0.07, 0.04, 0.05), (0, 1.168, 0.43), "dark_metal", bevel=0.006)
    D.mirror(k, (0.22, 1.17, 0.4), (0.32, 1.36, 0.43), size=(0.07, 0.042))
    # Sat-nav on a bar mount, facing the rider
    k.rod((0.0, 1.17, 0.43), (0.0, 1.25, 0.47), 0.008, "steel_dark", seg=6)
    k.box((0.14, 0.095, 0.03), (0, 1.29, 0.49), "dark_metal", rot=(-0.5, 0, 0), bevel=0.008)
    k.box((0.12, 0.075, 0.004), (0, 1.29, 0.474), "dash", rot=(-0.5, 0, 0), bevel=0)

    # Twin LED headlights in a black surround, a lit brow over each
    k.begin("headlight", (0, 0.955, 0.756))
    for side in (-1, 1):
        k.box((0.075, 0.05, 0.02), (side * 0.046, 0.945, 0.756), "headlight", rot=(-0.35, 0, side * 0.12), bevel=0.01)
        k.box((0.07, 0.009, 0.012), (side * 0.048, 0.98, 0.748), "headlight", rot=(-0.35, 0, side * 0.3), bevel=0.003)

    k.begin("brake_light", (0, 0.885, -1.04))
    k.box((0.13, 0.035, 0.02), (0, 0.885, -1.038), "brake", rot=(0.4, 0, 0), bevel=0.008)


def bodywork(k):
    k.begin("body")

    # Tank and upper fairing as one skin: a broad, flat-topped tank whose
    # shoulders run forward into the fairing round the lamps. Paint, with a
    # dark wedge and a pale stripe low on each flank of the tank, and black
    # under the lamps
    def skin(u, up, side):
        return "trim" if (u > 0.62 and up < -0.3) else "paint"

    k.loft(TANK, skin, ring=32, steps=4)
    # The slash on each flank: dark, a pale stripe under it
    D.decal(k, TANK, [(0.47, 1.02), (0.47, 0.93), (0.08, 0.79), (0.08, 0.86)], "paint_dark")
    D.decal(k, TANK, [(0.47, 0.925), (0.47, 0.895), (0.08, 0.76), (0.08, 0.785)], "accent")
    k.cylinder(0.04, 0.012, (0, 1.096, 0.26), "steel_dark", seg=14)
    # The lamps' black mask
    k.box((0.19, 0.11, 0.02), (0, 0.95, 0.748), "trim", rot=(-0.3, 0, 0), bevel=0.012)
    # The beak, sharp, out over the wheel: paint above, black below
    k.loft([(0.6, 0.8, 0.92, 0.13), (0.7, 0.81, 0.9, 0.115, 2.6, 3), (0.8, 0.825, 0.885, 0.08, 2.6, 4), (0.87, 0.838, 0.872, 0.04, 2.6, 4),
            (0.9, 0.845, 0.862, 0.01)], lambda u, up, side: "paint" if up > -0.1 else "trim", ring=14, steps=2, sharp=40)
    # Black cheeks each side of the nose, down to the shrouds; the front indicators
    for side in (-1, 1):
        D.panel(k, [(0.56, 0.98), (0.7, 0.95), (0.72, 0.84), (0.62, 0.8), (0.5, 0.84)], side * 0.15, 0.02, "trim", toe=-side * 0.3)
        D.indicator(k, (side * 0.15, 0.93, 0.6), (side * 0.2, 0.925, 0.62))

    # Tall touring screen on its brackets, the instruments behind it
    def screen(u, v):
        across = (v - 0.5) * 2
        half = 0.19 - 0.055 * u
        return (across * half, 1.08 + 0.44 * u, 0.67 - 0.17 * u ** 1.2 - 0.06 * across * across)

    k.sheet(screen, "glass", nu=6, nv=6, thick=0.006)
    for side in (-1, 1):
        k.rod((side * 0.12, 1.06, 0.62), (side * 0.13, 1.2, 0.62), 0.008, "dark_metal", seg=6)
    k.box((0.22, 0.14, 0.035), (0, 1.16, 0.53), "dark_metal", rot=(-0.55, 0, 0), bevel=0.01)
    k.box((0.18, 0.1, 0.006), (0, 1.168, 0.515), "dash", rot=(-0.55, 0, 0), bevel=0)

    # Radiator shrouds: broad black wings flared out at the front, a pale
    # flash over most of each, an aluminium panel under each
    for side in (-1, 1):
        x = side * 0.215
        D.panel(k, [(0.58, 0.88), (0.65, 0.76), (0.6, 0.55), (0.47, 0.46), (0.3, 0.5), (0.25, 0.68), (0.33, 0.8), (0.45, 0.86)], x, 0.026, "trim", toe=side * 0.15)
        D.panel(k, [(0.6, 0.72), (0.6, 0.6), (0.5, 0.52), (0.38, 0.52), (0.33, 0.6), (0.45, 0.66)], x + side * 0.016, 0.006, "accent", toe=side * 0.15, bevel=0.002)
        D.panel(k, [(0.49, 0.5), (0.5, 0.41), (0.36, 0.38), (0.3, 0.46)], side * 0.195, 0.012, "steel", toe=-side * 0.1)
        # Coolant hose from the radiator back into the engine
        k.tube([(side * 0.17, 0.5, 0.44), (side * 0.15, 0.46, 0.36), (side * 0.12, 0.5, 0.28)], 0.014, "rubber", seg=6, smooth=2)
    # Radiator between them, faced with a mesh
    k.box((0.42, 0.36, 0.05), (0, 0.67, 0.47), "dark_metal", rot=(-0.25, 0, 0), bevel=0.01)
    k.box((0.38, 0.32, 0.01), (0, 0.67, 0.498), "vent", rot=(-0.25, 0, 0), bevel=0)

    # Seat: one piece, the pillion stepped up behind the rider
    k.loft([(0.03, 0.86, 0.93, 0.1), (-0.05, 0.845, 0.905, 0.165, 3, 3), (-0.3, 0.835, 0.885, 0.17, 3, 3), (-0.44, 0.85, 0.905, 0.15, 3, 3), (-0.48, 0.86, 0.92, 0.12)],
           "seat", ring=14, steps=2)
    k.loft([(-0.45, 0.87, 0.94, 0.12), (-0.5, 0.875, 0.965, 0.15, 3, 3), (-0.74, 0.885, 0.975, 0.14, 3, 3), (-0.82, 0.89, 0.965, 0.1)], "seat", ring=14, steps=2)
    # Side panels under the seat and the tail
    k.loft([(0.0, 0.7, 0.85, 0.15), (-0.25, 0.7, 0.86, 0.16, 3, 3), (-0.55, 0.76, 0.89, 0.15, 3, 3), (-0.85, 0.83, 0.9, 0.11, 3, 3), (-1.04, 0.86, 0.91, 0.055)],
           "trim", ring=14, steps=2)
    # Rear hugger over the tyre
    k.guard((REAR[1], REAR[2]), REAR_R + 0.03, 0.17, math.radians(65), math.radians(125), "trim", crown=0.03, nu=7)
    # Plate hanger, a blank plate, the rear indicators
    k.beam((0, 0.86, -0.98), (0, 0.66, -1.12), (0.07, 0.025), "trim")
    D.plate(k, (0, 0.6, -1.135), size=(0.21, 0.15), lean=0.28)
    for side in (-1, 1):
        D.indicator(k, (side * 0.03, 0.72, -1.08), (side * 0.15, 0.725, -1.085))
    k.box((0.04, 0.03, 0.01), (0, 0.69, -1.1), "reflector", bevel=0)


def frame(k):
    k.begin("body")
    # Black steel frame: twin spars from the headstock to the pivot plates,
    # and down tubes in front of the engine
    head = (0, 0.98, 0.4)
    k.cylinder(0.042, 0.2, head, "dark_metal", rot=(-RAKE, 0, 0), seg=12)
    for side in (-1, 1):
        k.tube([(side * 0.04, 1.0, 0.38), (side * 0.13, 0.87, 0.16), (side * 0.15, 0.73, -0.06), (side * 0.15, 0.56, -0.17)], 0.022, "dark_metal", seg=8, smooth=2)
        k.tube([(side * 0.04, 0.94, 0.4), (side * 0.12, 0.7, 0.43), (side * 0.13, 0.46, 0.38), (side * 0.12, 0.33, 0.26)], 0.019, "dark_metal", seg=8, smooth=2)
        k.rod((side * 0.13, 0.86, 0.17), (side * 0.13, 0.66, 0.4), 0.014, "dark_metal", seg=6)
        # Pivot plate
        k.panel([(-0.06, 0.68), (-0.24, 0.62), (-0.26, 0.4), (-0.14, 0.33), (-0.05, 0.42)], side * 0.15, 0.024, "dark_metal")
        # Silver bolt-on subframe and the pillion peg hanger
        k.tube([(side * 0.145, 0.6, -0.18), (side * 0.15, 0.74, -0.5), (side * 0.13, 0.84, -0.88)], 0.015, "steel", seg=7, smooth=2)
        k.tube([(side * 0.12, 0.8, -0.06), (side * 0.13, 0.83, -0.5), (side * 0.12, 0.85, -0.92)], 0.014, "steel", seg=7, smooth=2)
        k.rod((side * 0.15, 0.68, -0.38), (side * 0.13, 0.83, -0.42), 0.011, "steel", seg=6)
        k.panel([(-0.33, 0.66), (-0.38, 0.66), (-0.46, 0.44), (-0.41, 0.42)], side * 0.168, 0.016, "steel")
        k.rod((side * 0.17, 0.43, -0.44), (side * 0.25, 0.43, -0.45), 0.012, "dark_metal", seg=8)
        # Grab rails and the luggage rack
        k.tube([(side * 0.15, 0.92, -0.48), (side * 0.18, 0.95, -0.74), (side * 0.16, 0.975, -1.0), (side * 0.06, 0.98, -1.06)], 0.012, "dark_metal", seg=7, smooth=2)
    k.box((0.34, 0.018, 0.4), (0, 1.0, -0.96), "dark_metal", bevel=0.005)


def engine(k):
    k.begin("body")
    # Inline triple: crankcase, a forward-leaning block, head and cam cover
    k.box((0.34, 0.26, 0.5), (0, 0.4, 0.08), "dark_metal", bevel=0.03)
    k.box((0.36, 0.22, 0.2), (0, 0.62, 0.22), "dark_metal", rot=(-0.18, 0, 0), bevel=0.02)
    if not k.low:
        for n in range(4):
            k.box((0.372, 0.008, 0.19), (0, 0.55 + n * 0.035, 0.205 + n * 0.006), "dark_metal", rot=(-0.18, 0, 0), bevel=0)
    k.box((0.34, 0.1, 0.19), (0, 0.76, 0.25), "steel_dark", rot=(-0.18, 0, 0), bevel=0.02)
    k.box((0.3, 0.05, 0.16), (0, 0.825, 0.26), "dark_metal", rot=(-0.18, 0, 0), bevel=0.015)
    # Clutch cover on the right, generator cover on the left, sprocket cover
    k.lathe([(0, 0), (0.11, 0), (0.11, 0.02), (0.085, 0.04), (0, 0.045)], (0.17, 0.4, 0.04), "dark_metal", axis="x", seg=18)
    k.lathe([(0, 0), (0.035, 0), (0.035, 0.012), (0, 0.012)], (0.214, 0.4, 0.04), "steel_dark", axis="x", seg=10)
    k.lathe([(0, 0), (0.1, 0), (0.1, 0.02), (0.07, 0.04), (0, 0.04)], (-0.17, 0.42, 0.14), "dark_metal", axis="x", rot=(0, 0, math.pi), seg=18)
    k.panel([(-0.06, 0.5), (-0.19, 0.48), (-0.2, 0.36), (-0.06, 0.34)], -0.18, 0.02, "dark_metal")
    # Sump guard, silver, and the crash bars round the engine and shrouds
    k.loft([(0.42, 0.3, 0.38, 0.1), (0.36, 0.24, 0.32, 0.17, 4, 3), (0.08, 0.235, 0.3, 0.18, 4, 3), (-0.12, 0.25, 0.3, 0.15)], "steel", ring=10, steps=2)
    for side in (-1, 1):
        k.tube([(side * 0.13, 0.62, 0.36), (side * 0.25, 0.58, 0.45), (side * 0.27, 0.42, 0.44), (side * 0.22, 0.31, 0.32), (side * 0.15, 0.3, 0.18)], 0.016, "steel", seg=8, smooth=3)
        k.tube([(side * 0.13, 0.86, 0.3), (side * 0.25, 0.82, 0.42), (side * 0.27, 0.66, 0.52), (side * 0.24, 0.56, 0.45), (side * 0.13, 0.55, 0.38)], 0.014, "steel", seg=8, smooth=3)
        k.rod((side * 0.27, 0.42, 0.44), (side * 0.27, 0.66, 0.52), 0.012, "steel", seg=6)
    # Exhaust: three headers down the front, a collector under the sump and
    # a link pipe up the right side to an angled, brushed silencer with a
    # black shield over its front and a black end cap
    for x in (-0.085, 0.0, 0.085):
        k.tube([(x, 0.74, 0.34), (x * 1.05, 0.62, 0.43), (x * 0.95, 0.42, 0.42), (x * 0.6 + 0.03, 0.28, 0.3), (0.05, 0.27, 0.1)], 0.021, "steel", seg=8, smooth=3)
    k.tube([(0.05, 0.27, 0.1), (0.12, 0.27, -0.12), (0.18, 0.36, -0.38), (0.2, 0.45, -0.52)], 0.03, "steel", seg=9, smooth=3)

    def can(u, up, side):
        if u < 0.32 or u > 0.93:
            return "dark_metal"
        if up > 0.55 and side > -0.2 and u < 0.5:
            return "dark_metal"
        return "steel"

    k.loft([(-0.52, 0.45, 0.53, 0.04, 3, 3, 0.5, 1, 1, 0.2), (-0.6, 0.46, 0.64, 0.068, 3.4, 3.4, 0.5, 0.85, 1, 0.21),
            (-0.94, 0.64, 0.81, 0.07, 3.4, 3.4, 0.5, 0.85, 1, 0.235), (-0.99, 0.675, 0.79, 0.052, 3, 3, 0.5, 1, 1, 0.24)], can, ring=16, steps=2)
    k.cylinder(0.026, 0.02, (0.24, 0.735, -0.995), "steel_dark", axis="z", seg=10)
    k.beam((0.17, 0.78, -0.75), (0.215, 0.7, -0.78), (0.02, 0.03), "dark_metal")


def chassis(k):
    k.begin("body")
    # Swingarm: black, deep at the pivot, tapering to the axle, braced
    for side in (-1, 1):
        k.loft([(PIVOT[1] + 0.02, 0.43, 0.53, 0.024, 3, 3, 0.5, 1, 1, side * 0.12), (PIVOT[1] - 0.12, 0.4, 0.51, 0.024, 3, 3, 0.5, 1, 1, side * 0.122),
                (REAR[2] + 0.02, 0.29, 0.355, 0.022, 3, 3, 0.5, 1, 1, side * 0.115), (REAR[2] - 0.05, 0.3, 0.345, 0.02, 3, 3, 0.5, 1, 1, side * 0.115)],
               "dark_metal", ring=10, steps=2)
        k.box((0.02, 0.05, 0.08), (side * 0.13, REAR[1], REAR[2]), "steel_dark", bevel=0.006)
    k.box((0.24, 0.05, 0.09), (0, 0.46, PIVOT[1] - 0.16), "dark_metal", bevel=0.012)
    k.rod((-0.17, PIVOT[0], PIVOT[1]), (0.17, PIVOT[0], PIVOT[1]), 0.022, "steel_dark", seg=10)
    k.rod((-0.14, REAR[1], REAR[2]), (0.14, REAR[1], REAR[2]), 0.012, "steel", seg=8)
    # Chain on the left, a guard over its top run
    parts.chain(k, x=-0.095, front=(0.42, -0.07, 0.045), rear=(REAR[1], REAR[2], 0.105))
    k.beam((-0.1, 0.48, -0.3), (-0.1, 0.43, -0.62), (0.02, 0.012), "trim")
    # Rear shock behind the engine
    parts.shock(k, (0.0, 0.8, -0.2), (0.0, 0.43, -0.34), 0.033)
    D.caliper(k, (RDISC_X, REAR[1], REAR[2]), RDISC_R, math.radians(205), size=(0.045, 0.055, 0.09))
    k.beam((0.115, REAR[1] - 0.01, REAR[2] + 0.02), (0.1, REAR[1] - 0.04, REAR[2] - 0.08), (0.012, 0.04), "steel_dark")
    # Rider pegs on hangers, the side stand
    parts.pegs(k, PEG, hanger=(0.55, -0.12), wide=0.06)
    k.rod((-0.15, 0.3, -0.04), (-0.3, 0.03, 0.08), 0.012, "steel_dark", seg=6)


def luggage(k):
    k.begin("body")
    D.top_box(k, (0, 1.19, -0.98), (0.55, 0.36, 0.45), lid="steel", body="luggage", caps="dark_metal")
    D.roll_bag(k, (0, 1.12, -0.6), 0.52, 0.14, mat="luggage", strap="dark_metal")


def draw(k):
    wheels(k)
    front_end(k)
    bodywork(k)
    frame(k)
    engine(k)
    chassis(k)
    luggage(k)


def build():
    k = D.DKit(seed=110, colours=COLOURS)
    k.colours["paint"] = (COLOURS["paint"], 0.5, 0.35)
    for lod in D.LODS:
        k.level(lod)
        draw(k)
    k.finish_lods(OUT, {"grip": GRIP, "peg": PEG, "seat": SEAT})
    D.previews(k, "bike10_tiger900")


build()
