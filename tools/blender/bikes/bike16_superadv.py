# bike-16: Shane's big adventure tourer, from the owner's photo of it (left
# side). A large V-twin adventure tourer of about 2021 in orange and black:
# a broad black front with a wide headlight unit and no beak, a tall clear
# screen leaning back over the instruments, a black tank top over orange
# saddle tanks that hang low each side of the engine, black shrouds under
# them, a close black front mudguard over a 19 inch black cast wheel, a 17
# inch rear, twin front discs, dark upside-down forks behind black guards,
# hand guards, an orange trellis frame whose subframe shows under the seat, a
# black V-twin over a black sump guard, a white shock spring, a black
# swingarm, and a brushed silencer with a black end cap on the right. A plain
# black band with a white line under it stands in for the tank's graphics.
# No badges, no wordmark, no plate lettering.
#
# Its luggage (the node `luggage`): a black top box on the rear rack and a
# large duffel bag strapped across the pillion seat. No pillion. The duffel
# starts behind the rider's seat, so that the rider keeps clear of it seated,
# leaning and standing (tests/unit/bikemodels.test.js rides each of them).
#
# Real size (the class's published figures): 1,557 mm wheelbase, 860 mm
# seat, 24.7 degrees of caster, 120/70-19 and 170/60-17 tyres, twin 320 mm
# front discs, a 267 mm rear disc.
#   blender --background --factory-startup --python tools/blender/bikes/bike16_superadv.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_E as E  # noqa: E402
import _kit_D as D  # noqa: E402  (the hand guard and the graphic laid on a loft)
import bike_parts as parts  # noqa: E402

NAME = "bike16_superadv"
OUT = os.path.join(E.OUT_DIR, NAME + ".glb")
FRONT, REAR = (0, 0.325, 0.7785), (0, 0.318, -0.7785)
FRONT_R, REAR_R = 0.325, 0.318
# A 19 inch front rim and a 17 inch rear
RIM_F, RIM_R = 0.2413, 0.2159
RAKE = math.radians(24.7)
FORK_LEN = 0.8
TOP = (FRONT[1] + FORK_LEN * math.cos(RAKE), FRONT[2] - FORK_LEN * math.sin(RAKE))
FORK_X = 0.105
DISC_X, DISC_R = 0.068, 0.16
# The rear disc is on the right, opposite the chain
RDISC_X, RDISC_R = 0.08, 0.1335
GRIP = (0.38, 1.13, 0.3)
PEG = (0.2, 0.38, -0.12)
SEAT = (0, 0.865, -0.18)
# Swingarm pivot (y, z)
PIVOT = (0.45, -0.15)
# The lamp's middle in the face of the nose, and how far that face leans back
LAMP = (0, 1.035, 0.778)
LAMP_LEAN = -0.5

COLOURS = {"paint": 0xF06014, "paint_dark": 0x9C3208, "accent": 0xE6E6E4, "rim": 0x151618, "caliper": 0x2A2B2E, "spring": 0xE4E4E2, "luggage": 0x3A3D42,
           "plate": 0xE8C22C, "trim": 0x151618, "seat": 0x17181B, "pillion": 0x1C1D20}
EXTRA = {
    # The orange trellis frame and subframe
    "frame": (0xE8560E, 0.4, 0.5),
    "casing": (0x202124, 0.5, 0.6),
    # The graphics' black band
    "block": (0x101012, 0.6, 0.1),
    # The top box's moulded black plastic, and the straps
    "case": (0x131417, 0.38, 0.15),
    "strap": (0x0C0C0E, 0.9, 0.0),
    "alu": (0xA6A9AE, 0.36, 0.9),
}

# Tank top and upper fairing as one skin, from the seat's nose to the lamp
TANK = [
    (-0.1, 0.84, 0.92, 0.1),
    (0.0, 0.79, 0.955, 0.15, 3.6, 3.6),
    (0.15, 0.76, 0.99, 0.165, 4.0, 4.0, 0.5, 0.85),
    (0.32, 0.76, 1.03, 0.17, 4.0, 4.0, 0.5, 0.82),
    (0.48, 0.8, 1.07, 0.185, 4.0, 4.0, 0.5, 0.8),
    (0.6, 0.85, 1.11, 0.2, 4.0, 3.4, 0.5, 0.8),
    (0.7, 0.88, 1.13, 0.195, 4.0, 3.0, 0.5, 0.8),
    (0.76, 0.9, 1.1, 0.18, 4.0, 3.0, 0.45, 0.85),
    (0.8, 0.91, 1.02, 0.135, 4.0, 3.0),
    (0.815, 0.92, 0.97, 0.08),
]


# One saddle tank: a lobe down the side of the engine, deepest under the
# tank's middle, its top edge climbing from the nose to the seat
def lobe(side):
    c = side * 0.16
    return [
        (0.61, 0.76, 0.81, 0.02, 3, 3, 0.6, 0.7, 0.6, c),
        (0.53, 0.7, 0.84, 0.055, 3, 3, 0.6, 0.7, 0.6, c),
        (0.4, 0.62, 0.885, 0.07, 3, 3, 0.6, 0.7, 0.6, c),
        (0.27, 0.535, 0.925, 0.076, 3, 3, 0.6, 0.7, 0.6, c),
        (0.2, 0.52, 0.94, 0.076, 3, 3, 0.6, 0.7, 0.6, c),
        (0.12, 0.57, 0.95, 0.072, 3, 3, 0.6, 0.7, 0.6, c),
        (0.0, 0.69, 0.945, 0.06, 3, 3, 0.6, 0.7, 0.6, c),
        (-0.1, 0.8, 0.91, 0.03, 3, 3, 0.6, 0.7, 0.6, c),
    ]


def wheels(k):
    k.begin("wheel_front", FRONT)
    E.wheel(k, FRONT, FRONT_R, 0.12, RIM_F, spokes="cast", count=10, hub=0.048, sweep=0.07)
    k.begin("wheel_rear", REAR)
    E.wheel(k, REAR, REAR_R, 0.17, RIM_R, spokes="cast", count=10, hub=0.055, sweep=0.07)
    # Sprocket on the left, inboard of the swingarm
    parts.sprocket(k, REAR, -0.1, 0.105)
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
        # Dark upside-down forks, the sliders behind black guards, a radial caliper on each
        E.usd_fork(k, side, axle, TOP, 0.03, 0.024, "steel_dark", x=FORK_X, guard="trim", disc=(DISC_X, DISC_R), caliper_size=(0.05, 0.062, 0.115))
    k.begin("body")
    E.yokes(k, FORK_X, axle, TOP, 0.1)
    # The close front mudguard, black, with a stay down to each fork foot
    k.guard((FRONT[1], FRONT[2]), FRONT_R + 0.03, 0.15, math.radians(22), math.radians(138), "trim", crown=0.035, nu=12)
    for side in (-1, 1):
        k.panel([(0.86, 0.67), (0.84, 0.5), (0.77, 0.44), (0.71, 0.5), (0.7, 0.66)], side * 0.08, 0.01, "trim", bevel=0.003)

    clamp = (TOP[0] + 0.055, TOP[1] - 0.03)
    k.begin("handlebar", (0, clamp[0], clamp[1]))
    for side in (-1, 1):
        g = (side * GRIP[0], GRIP[1], GRIP[2])
        k.tube([(0, clamp[0], clamp[1]), (side * 0.1, clamp[0] + 0.005, clamp[1]), (side * 0.24, GRIP[1] - 0.005, GRIP[2] + 0.05), (side * 0.3, GRIP[1], GRIP[2] + 0.02),
                E.along(g, (side * 0.45, GRIP[1], GRIP[2] - 0.02), 0.5)], [0.014, 0.014, 0.012, 0.011, 0.011], "dark_metal", seg=8, smooth=2)
        E.lever_set(k, GRIP, side, 0.24)
        D.hand_guard(k, GRIP, side, mat="trim")
        k.cylinder(0.018, 0.06, (side * 0.05, clamp[0] - 0.03, clamp[1] + 0.005), "steel_dark", seg=8)
    k.box((0.07, 0.04, 0.05), (0, clamp[0] + 0.018, clamp[1]), "dark_metal", bevel=0.006)
    E.mirror(k, (0.24, GRIP[1] + 0.03, GRIP[2] + 0.06), (0.35, GRIP[1] + 0.2, GRIP[2] + 0.08), size=(0.07, 0.04), mat="trim")

    # The wide headlight unit in the face of the nose: a lens each side of a
    # dark middle, a lit strip down each outer edge
    k.begin("headlight", LAMP)
    for side in (-1, 1):
        k.box((0.115, 0.1, 0.014), (side * 0.068, LAMP[1] + 0.006, LAMP[2] + 0.011), "headlight", rot=(LAMP_LEAN, side * 0.12, 0), bevel=0.014)
        k.box((0.012, 0.125, 0.012), (side * 0.143, LAMP[1] + 0.005, LAMP[2] + 0.002), "headlight", rot=(LAMP_LEAN, side * 0.3, side * 0.12), bevel=0.004)

    k.begin("brake_light", (0, 0.875, -1.02))
    k.box((0.13, 0.03, 0.02), (0, 0.875, -1.02), "brake", rot=(0.3, 0, 0), bevel=0.008)


def bodywork(k):
    k.begin("body")

    # Tank top and nose: black on top and round the lamp, orange on the
    # tank's shoulders above the saddle tanks
    k.loft(TANK, "trim", ring=32, steps=4)
    k.cylinder(0.04, 0.012, (0, 1.004, 0.2), "steel_dark", rot=(-0.2, 0, 0), seg=14)
    # The lamp's black housing in the face of the nose, a dark bar down its middle
    k.box((0.32, 0.15, 0.03), LAMP, "block", rot=(LAMP_LEAN, 0, 0), bevel=0.016)
    k.box((0.02, 0.11, 0.012), (0, LAMP[1] + 0.008, LAMP[2] + 0.014), "trim", rot=(LAMP_LEAN, 0, 0), bevel=0.003)
    # The chin under the lamp, down to the fork yoke: black, short, no beak
    k.loft([(0.6, 0.79, 0.9, 0.16), (0.72, 0.83, 0.93, 0.14, 3, 3), (0.8, 0.88, 0.95, 0.09)], "trim", ring=12, steps=2)

    for side in (-1, 1):
        # The saddle tank: orange, its underside black
        k.loft(lobe(side), lambda u, up, s: "trim" if up < -0.8 else "paint", ring=18, steps=3)
        # The black shroud ahead of and under it, over the radiator, and a vent slot
        E.panel(k, [(0.62, 0.84), (0.66, 0.72), (0.6, 0.55), (0.48, 0.44), (0.36, 0.42), (0.34, 0.5), (0.47, 0.62), (0.55, 0.78)], side * 0.195, 0.026, "trim",
                toe=side * 0.14, bevel=0.008)
        E.panel(k, [(0.6, 0.7), (0.58, 0.58), (0.52, 0.52), (0.53, 0.64)], side * 0.211, 0.006, "vent", toe=side * 0.14, bevel=0)
        # Front indicators on the fairing's shoulders
        E.indicator(k, (side * 0.17, 0.97, 0.63), (side * 0.235, 0.965, 0.645), radius=0.011, stalk="trim")
    # The graphics, without a letter: a black band along each saddle tank, a white line under it
    D.decal(k, lobe(1), [(0.44, 0.8), (0.4, 0.72), (0.06, 0.78), (0.02, 0.87)], "block")
    D.decal(k, lobe(1), [(0.39, 0.705), (0.38, 0.685), (0.1, 0.735), (0.075, 0.76)], "accent")
    # Radiator between the shrouds, faced with a mesh
    k.box((0.36, 0.3, 0.05), (0, 0.64, 0.5), "dark_metal", rot=(-0.28, 0, 0), bevel=0.01)
    k.box((0.32, 0.26, 0.01), (0, 0.64, 0.528), "vent", rot=(-0.28, 0, 0), bevel=0)

    # Tall touring screen leaning back, on its brackets, the instruments behind it
    def screen(u, v):
        across = (v - 0.5) * 2
        half = 0.205 - 0.06 * u
        return (across * half, 1.12 + 0.36 * u, 0.725 - 0.27 * u ** 1.15 - 0.07 * across * across)

    k.sheet(screen, "glass", nu=8, nv=6, thick=0.006)
    for side in (-1, 1):
        k.rod((side * 0.12, 1.07, 0.64), (side * 0.13, 1.22, 0.6), 0.008, "dark_metal", seg=6)
    k.box((0.2, 0.13, 0.035), (0, 1.17, 0.54), "dark_metal", rot=(-0.6, 0, 0), bevel=0.01)
    k.box((0.17, 0.1, 0.006), (0, 1.177, 0.524), "dash", rot=(-0.6, 0, 0), bevel=0)

    # Seat: the rider's, and the pillion's stepped up behind it (under the duffel)
    k.loft([(0.0, 0.855, 0.935, 0.1), (-0.07, 0.84, 0.9, 0.165, 3, 3), (-0.3, 0.83, 0.88, 0.175, 3, 3), (-0.42, 0.845, 0.9, 0.155, 3, 3), (-0.46, 0.855, 0.915, 0.12)],
           "seat", ring=14, steps=2)
    k.loft([(-0.43, 0.87, 0.915, 0.12), (-0.48, 0.875, 0.93, 0.15, 3, 3), (-0.74, 0.885, 0.935, 0.14, 3, 3), (-0.82, 0.89, 0.925, 0.1)], "pillion", ring=14, steps=2)
    # Black side panels under the seat and the tail, inside the subframe's tubes
    k.loft([(0.0, 0.66, 0.85, 0.135), (-0.25, 0.66, 0.86, 0.145, 3, 3), (-0.5, 0.74, 0.89, 0.145, 3, 3), (-0.85, 0.84, 0.9, 0.12, 3, 3), (-1.02, 0.86, 0.9, 0.06)],
           "trim", ring=14, steps=2)
    # Rear hugger over the tyre
    k.guard((REAR[1], REAR[2]), REAR_R + 0.03, 0.19, math.radians(60), math.radians(125), "trim", crown=0.03, nu=7)
    # Plate hanger, a blank plate, the rear indicators
    k.beam((0, 0.85, -0.98), (0, 0.64, -1.13), (0.07, 0.025), "trim")
    E.plate(k, (0, 0.58, -1.145), size=(0.21, 0.15), lean=0.28)
    for side in (-1, 1):
        E.indicator(k, (side * 0.03, 0.71, -1.085), (side * 0.15, 0.715, -1.09), stalk="trim")
    k.box((0.04, 0.03, 0.01), (0, 0.68, -1.105), "reflector", bevel=0)


def frame(k):
    k.begin("body")
    k.cylinder(0.042, 0.2, (0, TOP[0] - 0.09, TOP[1] + 0.04), "frame", rot=(-RAKE, 0, 0), seg=12)
    for side in (-1, 1):
        # Orange trellis: two tubes each side from the steering head to the
        # pivot plates, laced together
        k.tube([(side * 0.04, 0.99, 0.4), (side * 0.13, 0.87, 0.16), (side * 0.15, 0.72, -0.05), (side * 0.15, 0.56, -0.16)], 0.02, "frame", seg=8, smooth=2)
        k.tube([(side * 0.04, 0.92, 0.42), (side * 0.12, 0.73, 0.3), (side * 0.13, 0.57, 0.16), (side * 0.14, 0.5, -0.08)], 0.017, "frame", seg=8, smooth=2)
        k.rod((side * 0.13, 0.87, 0.16), (side * 0.125, 0.7, 0.27), 0.013, "frame", seg=6)
        k.rod((side * 0.15, 0.72, -0.05), (side * 0.13, 0.57, 0.16), 0.013, "frame", seg=6)
        k.panel([(-0.06, 0.66), (-0.23, 0.61), (-0.25, 0.4), (-0.14, 0.33), (-0.05, 0.42)], side * 0.15, 0.024, "dark_metal")
        # The subframe, orange, outside the tail's panels: an upper and a lower
        # rail to the tail, laced
        upper = [(side * 0.15, 0.8, -0.12), (side * 0.165, 0.835, -0.5), (side * 0.14, 0.87, -0.92)]
        lower = [(side * 0.155, 0.58, -0.2), (side * 0.17, 0.7, -0.5), (side * 0.145, 0.85, -0.88)]
        k.tube(upper, 0.014, "frame", seg=7, smooth=2)
        k.tube(lower, 0.014, "frame", seg=7, smooth=2)
        for a, b in (((0.8, -0.14), (0.62, -0.3)), ((0.62, -0.3), (0.82, -0.36)), ((0.82, -0.36), (0.7, -0.5)), ((0.7, -0.5), (0.845, -0.62)),
                     ((0.845, -0.62), (0.79, -0.74))):
            k.rod((side * 0.162, a[0], a[1]), (side * 0.162, b[0], b[1]), 0.011, "frame", seg=6)
        # The pillion peg hanger, black, its peg folded
        k.panel([(-0.36, 0.66), (-0.42, 0.66), (-0.5, 0.46), (-0.45, 0.44)], side * 0.18, 0.016, "dark_metal")
        k.rod((side * 0.185, 0.45, -0.475), (side * 0.2, 0.5, -0.56), 0.012, "dark_metal", seg=8)
        # Grab rails beside the pillion seat, out to the rack
        k.tube([(side * 0.17, 0.9, -0.5), (side * 0.2, 0.925, -0.74), (side * 0.17, 0.925, -0.98), (side * 0.07, 0.925, -1.04)], 0.012, "dark_metal", seg=7, smooth=2)
    # The rack and the top box's plate on it
    k.box((0.3, 0.018, 0.42), (0, 0.925, -1.0), "dark_metal", bevel=0.005)


def engine(k):
    k.begin("body")
    # V-twin: crankcase, the front cylinder leaning forward and the rear one
    # back under the tank, their heads black
    k.box((0.3, 0.26, 0.46), (0, 0.4, 0.06), "casing", bevel=0.03)
    k.box((0.2, 0.22, 0.17), (0, 0.6, 0.24), "casing", rot=(-0.62, 0, 0), bevel=0.02)
    k.box((0.2, 0.1, 0.18), (0, 0.7, 0.33), "dark_metal", rot=(-0.62, 0, 0), bevel=0.02)
    k.box((0.2, 0.22, 0.17), (0, 0.62, -0.03), "casing", rot=(0.55, 0, 0), bevel=0.02)
    k.box((0.2, 0.1, 0.18), (0, 0.73, -0.1), "dark_metal", rot=(0.55, 0, 0), bevel=0.02)
    # Clutch cover on the right, generator cover on the left, sprocket cover
    k.lathe([(0, 0), (0.11, 0), (0.11, 0.02), (0.085, 0.04), (0, 0.045)], (0.15, 0.4, 0.03), "casing", axis="x", seg=18)
    k.lathe([(0, 0), (0.035, 0), (0.035, 0.012), (0, 0.012)], (0.194, 0.4, 0.03), "steel_dark", axis="x", seg=10)
    k.lathe([(0, 0), (0.1, 0), (0.1, 0.02), (0.07, 0.04), (0, 0.04)], (-0.15, 0.42, 0.13), "casing", axis="x", rot=(0, 0, math.pi), seg=18)
    k.panel([(-0.06, 0.5), (-0.19, 0.48), (-0.2, 0.36), (-0.06, 0.34)], -0.16, 0.02, "dark_metal")
    # Sump guard, black
    k.loft([(0.4, 0.3, 0.38, 0.09), (0.34, 0.24, 0.32, 0.15, 4, 3), (0.06, 0.235, 0.3, 0.16, 4, 3), (-0.14, 0.25, 0.3, 0.13)], "trim", ring=10, steps=2)
    # Exhaust: the front header down under the engine, the rear one down
    # behind it, a link pipe up the right side to the silencer: brushed, a
    # black shield over its front and a black end cap
    k.tube([(0.0, 0.66, 0.36), (0.04, 0.52, 0.42), (0.07, 0.34, 0.36), (0.09, 0.27, 0.16), (0.1, 0.27, -0.05)], 0.024, "steel", seg=8, smooth=3)
    k.tube([(0.0, 0.66, -0.14), (0.06, 0.5, -0.2), (0.1, 0.34, -0.14), (0.1, 0.27, -0.05)], 0.022, "steel", seg=8, smooth=3)
    k.tube([(0.1, 0.27, -0.05), (0.14, 0.3, -0.22), (0.19, 0.4, -0.4), (0.21, 0.47, -0.5)], 0.03, "steel", seg=9, smooth=3)

    def can(u, up, side):
        if u < 0.3 or u > 0.92:
            return "dark_metal"
        if up > 0.5 and side > -0.2 and u < 0.5:
            return "dark_metal"
        return "alu"

    k.loft([(-0.5, 0.47, 0.55, 0.04, 3, 3, 0.5, 1, 1, 0.21), (-0.58, 0.48, 0.65, 0.066, 3.4, 3.4, 0.5, 0.85, 1, 0.22),
            (-0.94, 0.6, 0.77, 0.068, 3.4, 3.4, 0.5, 0.85, 1, 0.24), (-0.99, 0.635, 0.75, 0.05, 3, 3, 0.5, 1, 1, 0.245)], can, ring=16, steps=2)
    k.cylinder(0.026, 0.02, (0.245, 0.695, -0.995), "steel_dark", axis="z", seg=10)
    k.beam((0.175, 0.8, -0.72), (0.22, 0.7, -0.76), (0.02, 0.03), "dark_metal")


def chassis(k):
    k.begin("body")
    # Swingarm: black, deep at the pivot, tapering to the axle, braced
    for side in (-1, 1):
        k.loft([(PIVOT[1] + 0.02, 0.41, 0.52, 0.024, 3, 3, 0.5, 1, 1, side * 0.12), (PIVOT[1] - 0.12, 0.385, 0.5, 0.024, 3, 3, 0.5, 1, 1, side * 0.122),
                (REAR[2] + 0.02, 0.285, 0.35, 0.022, 3, 3, 0.5, 1, 1, side * 0.118), (REAR[2] - 0.05, 0.295, 0.34, 0.02, 3, 3, 0.5, 1, 1, side * 0.118)],
               "dark_metal", ring=10, steps=2)
        k.box((0.02, 0.05, 0.08), (side * 0.133, REAR[1], REAR[2]), "steel_dark", bevel=0.006)
    k.box((0.24, 0.05, 0.09), (0, 0.45, PIVOT[1] - 0.16), "dark_metal", bevel=0.012)
    k.rod((-0.17, PIVOT[0], PIVOT[1]), (0.17, PIVOT[0], PIVOT[1]), 0.022, "steel_dark", seg=10)
    k.rod((-0.145, REAR[1], REAR[2]), (0.145, REAR[1], REAR[2]), 0.012, "steel", seg=8)
    # Chain on the left, a guard over its top run
    parts.chain(k, x=-0.1, front=(0.41, -0.06, 0.045), rear=(REAR[1], REAR[2], 0.105))
    k.beam((-0.105, 0.475, -0.28), (-0.105, 0.43, -0.62), (0.02, 0.012), "trim")
    # Rear shock behind the engine, its spring white
    parts.shock(k, (0.0, 0.78, -0.2), (0.0, 0.42, -0.33), 0.035)
    E.caliper(k, (RDISC_X, REAR[1], REAR[2]), RDISC_R, math.radians(205), size=(0.045, 0.055, 0.09))
    k.beam((0.118, REAR[1] - 0.01, REAR[2] + 0.02), (0.1, REAR[1] - 0.04, REAR[2] - 0.08), (0.012, 0.04), "steel_dark")
    # Rider pegs on hangers, the side stand
    parts.pegs(k, PEG, hanger=(0.55, -0.14), wide=0.06)
    k.side_stand((-0.15, 0.3, -0.04), (-0.3, 0.03, 0.08), 0.012, "steel_dark", seg=6)


def luggage(k):
    k.begin("luggage", (0, 1.08, -0.82))
    # The duffel across the pillion seat: a soft pillow of a bag, its front
    # face behind the rider's seat, two straps over it and down to the
    # subframe, a zip along its top, a carry handle at each end
    bag = [(-0.79, 1.0, 1.12, 0.24), (-0.77, 0.95, 1.18, 0.3, 2.8, 3.2), (-0.64, 0.938, 1.21, 0.32, 2.8, 3.2), (-0.52, 0.95, 1.18, 0.3, 2.8, 3.2),
           (-0.5, 1.0, 1.12, 0.24)]
    k.loft(bag, "luggage", ring=20, steps=3)
    for x in (-0.15, 0.15):
        k.loft([(z + (0.008 if z > -0.64 else -0.008 if z < -0.64 else 0), lo - 0.006, hi + 0.007, 0.022, 2.8, 3.2, 0.5, 1, 1, x) for z, lo, hi, *_ in bag], "strap",
               ring=12, steps=3)
        for z in (-0.5, -0.79):
            k.rod((x, 1.0, z), (x * 1.05, 0.89, z + (0.03 if z > -0.6 else -0.01)), 0.008, "strap", seg=5)
    k.box((0.46, 0.008, 0.014), (0, 1.212, -0.64), "strap", bevel=0.002)
    for side in (-1, 1):
        k.tube([(side * 0.32, 1.03, -0.69), (side * 0.345, 1.08, -0.64), (side * 0.32, 1.03, -0.59)], 0.008, "strap", seg=5, smooth=2)

    # The top box on the rack: moulded black plastic, rounded, the lid's seam
    # round it, a catch and a reflector on its back
    k.loft([(0.94, -1.19, -0.87, 0.19, 4, 4), (0.975, -1.215, -0.85, 0.235, 4, 4), (1.1, -1.225, -0.845, 0.25, 4, 4), (1.2, -1.215, -0.855, 0.235, 4, 4),
            (1.235, -1.17, -0.89, 0.18, 4, 4)], "case", axis="y", ring=20, steps=3)
    k.loft([(1.094, -1.229, -0.841, 0.254, 4, 4), (1.106, -1.229, -0.841, 0.254, 4, 4)], "strap", axis="y", ring=20, steps=1)
    k.box((0.07, 0.06, 0.02), (0, 1.09, -1.232), "strap", bevel=0.008)
    k.box((0.2, 0.03, 0.008), (0, 1.0, -1.222), "reflector", rot=(0.12, 0, 0), bevel=0)


def draw(k):
    wheels(k)
    front_end(k)
    bodywork(k)
    frame(k)
    engine(k)
    chassis(k)
    luggage(k)


def build():
    k = E.EKit(seed=116, colours=COLOURS, extra=EXTRA)
    for lod in E.LODS:
        k.level(lod)
        draw(k)
    k.finish_lods(OUT, {"grip": GRIP, "peg": PEG, "seat": SEAT})
    E.previews(k, NAME, height=0.75, reach=1.08)


build()
