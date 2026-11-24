# bike-17: Steve's mini moto, by the owner's word: a black 125 cc mini bike, which a tall rider makes look a bit
# ridiculous, with a seat extension running back past the rear wheel. From general knowledge of the class (no photo):
# small and stocky on 12 inch cast wheels with fat little tyres, short upside-down forks, a small round-cornered
# headlight in a black nose, a stubby tank between black shrouds, a horizontal single under a black steel frame, a
# short black swingarm, a low silencer on the right, and a flat seat that runs back over the tail on a black extension
# rack. Gloss black, dark grey details. No badges, no wordmark, no plate lettering.
#
# Real size (the class's published figures): 1,200 mm wheelbase, 760 mm seat, 25 degrees of caster, 120/70-12 and
# 130/70-12 tyres, a 220 mm front disc, a 204 mm rear disc. The extension carries the seat about 0.3 m further back.
#   blender --background --factory-startup --python tools/blender/bikes/bike17_minimoto.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_E as E  # noqa: E402
import bike_parts as parts  # noqa: E402

NAME = "bike17_minimoto"
OUT = os.path.join(E.OUT_DIR, NAME + ".glb")
FRONT, REAR = (0, 0.236, 0.6), (0, 0.24, -0.6)
FRONT_R, REAR_R = 0.236, 0.24
# 12 inch rims front and rear
RIM_F = RIM_R = 0.1524
RAKE = math.radians(25)
FORK_LEN = 0.62
TOP = (FRONT[1] + FORK_LEN * math.cos(RAKE), FRONT[2] - FORK_LEN * math.sin(RAKE))
FORK_X = 0.085
# The one front disc is on the left (-x as written here: the kit mirrors on export)
DISC_SIDE = -1
DISC_X, DISC_R = 0.05, 0.11
RDISC_X, RDISC_R = 0.052, 0.102
ARM_X = 0.1
GRIP = (0.33, 0.93, 0.27)
PEG = (0.17, 0.31, -0.12)
# The rider sits back on the extension: well behind the bike's middle (the owner: the centre of gravity far back)
SEAT = (0, 0.78, -0.42)
PIVOT = (0.33, -0.18)

COLOURS = {"paint": 0x161618, "paint_dark": 0x080809, "accent": 0x3A3C40, "rim": 0x141416, "caliper": 0x2B2C30, "spring": 0x2E3034,
           "trim": 0x151618, "seat": 0x101011, "plastic": 0x1C1D20}
EXTRA = {
    "alu": (0x6C6F74, 0.4, 0.9),
    "casing": (0x2A2B2F, 0.5, 0.6),
    "frame": (0x101012, 0.45, 0.6),
}


def wheels(k):
    k.begin("wheel_front", FRONT)
    E.wheel(k, FRONT, FRONT_R, 0.12, RIM_F, spokes="cast", count=5, hub=0.045)
    k.begin("wheel_rear", REAR)
    E.wheel(k, REAR, REAR_R, 0.13, RIM_R, spokes="cast", count=5, hub=0.045)
    parts.sprocket(k, REAR, -0.075, 0.08)
    k.begin("disc_front", (DISC_SIDE * DISC_X, FRONT[1], FRONT[2]))
    k.disc((DISC_SIDE * DISC_X, FRONT[1], FRONT[2]), DISC_R, arms=5)
    k.begin("disc_rear", (RDISC_X, REAR[1], REAR[2]))
    k.disc((RDISC_X, REAR[1], REAR[2]), RDISC_R, arms=4)


def front_end(k):
    axle = (FRONT[1], FRONT[2])
    mid = E.along(axle, TOP, 0.5)
    for side, name in ((-1, "fork_left"), (1, "fork_right")):
        k.begin(name, (side * FORK_X, mid[0], mid[1]))
        E.usd_fork(k, side, axle, TOP, 0.022, 0.017, "trim", x=FORK_X, split=0.45,
                   disc=(DISC_X, DISC_R) if side == DISC_SIDE else None, caliper_angle=math.radians(205), caliper_size=(0.04, 0.045, 0.08))
    k.begin("body")
    E.yokes(k, FORK_X, axle, TOP, 0.06, lower=0.72)

    # A flat bar on short risers, the grips and levers, two small round mirrors
    clamp = (TOP[0] + 0.04, TOP[1] - 0.02)
    k.begin("handlebar", (0, clamp[0], clamp[1]))
    for side in (-1, 1):
        k.tube([(0, clamp[0], clamp[1]), (side * 0.1, clamp[0] + 0.003, clamp[1]), (side * (GRIP[0] + 0.06), GRIP[1], GRIP[2])], 0.011, "steel_dark", seg=8, smooth=2)
        k.cylinder(0.016, 0.04, (side * 0.045, clamp[0] - 0.02, clamp[1]), "alu", seg=8)
        E.lever_set(k, GRIP, side, 0.17)
    E.mirror(k, (0.2, GRIP[1] + 0.01, GRIP[2] + 0.02), (0.28, GRIP[1] + 0.17, GRIP[2] + 0.01), size=(0.05, 0.035), mat="trim", shape="round")

    # The small headlight in the face of the black nose
    k.begin("headlight", (0, 0.8, 0.47))
    k.box((0.1, 0.07, 0.014), (0, 0.8, 0.473), "headlight", rot=(-0.3, 0, 0), bevel=0.02)

    # The tail light at the end of the seat's extension
    k.begin("brake_light", (0, 0.7, -0.98))
    k.box((0.09, 0.03, 0.025), (0, 0.7, -0.98), "brake", rot=(-0.15, 0, 0), bevel=0.008)


def bodywork(k):
    k.begin("body")
    # Front mudguard, low over the little wheel
    k.guard((FRONT[1], FRONT[2]), FRONT_R + 0.03, 0.14, math.radians(-30), math.radians(110), "paint", crown=0.02, nu=8)
    # The nose: a black shroud round the headlight and the clocks
    k.loft([(0.72, 0.4, 0.44, 0.08, 3, 3), (0.78, 0.43, 0.48, 0.11, 3, 3), (0.86, 0.38, 0.47, 0.11, 3, 3), (0.9, 0.34, 0.42, 0.07, 3, 3)], "paint", axis="y", ring=12, steps=2)
    k.box((0.12, 0.09, 0.012), (0, 0.8, 0.466), "trim", rot=(-0.3, 0, 0), bevel=0.012)
    k.box((0.09, 0.05, 0.025), (0, 0.9, 0.34), "trim", rot=(-0.8, 0, 0), bevel=0.008)
    k.box((0.07, 0.035, 0.004), (0, 0.906, 0.33), "dash", rot=(-0.8, 0, 0), bevel=0)
    for side in (-1, 1):
        E.indicator(k, (side * 0.07, 0.78, 0.42), (side * 0.13, 0.785, 0.43), radius=0.01, stalk="trim")

    # Stubby tank in black shrouds, the filler cap on top
    k.loft([(0.3, 0.66, 0.76, 0.08), (0.22, 0.62, 0.8, 0.13, 2.6, 2.6), (0.06, 0.6, 0.8, 0.135, 2.6, 2.6), (-0.06, 0.62, 0.76, 0.11, 2.6, 2.6), (-0.12, 0.64, 0.72, 0.08)],
           "paint", ring=14, steps=2)
    k.cylinder(0.028, 0.018, (0, 0.805, 0.14), "trim", rot=(-0.05, 0, 0), seg=12)
    for side in (-1, 1):
        E.panel(k, [(0.34, 0.5), (0.4, 0.66), (0.3, 0.76), (0.1, 0.74), (0.04, 0.58), (0.2, 0.5)], side * 0.14, 0.024, "paint", toe=side * -0.15, bevel=0.01)
        E.panel(k, [(0.34, 0.6), (0.3, 0.7), (0.14, 0.7), (0.12, 0.62)], side * 0.156, 0.006, "accent", toe=side * -0.15, bevel=0)
        # Side covers under the seat
        E.panel(k, [(-0.1, 0.5), (-0.38, 0.52), (-0.46, 0.66), (-0.12, 0.66)], side * 0.12, 0.018, "plastic", toe=side * 0.05, bevel=0.008)

    # The flat seat: short over the tank's back, then on along the extension, well past the rear wheel
    k.loft([(0.0, 0.76, 0.79, 0.05), (-0.1, 0.735, 0.785, 0.1, 3.4, 3), (-0.3, 0.73, 0.795, 0.115, 3.4, 3), (-0.6, 0.735, 0.8, 0.115, 3.4, 3), (-0.86, 0.74, 0.795, 0.1, 3.4, 3),
            (-0.94, 0.75, 0.785, 0.06)], "seat", ring=14, steps=2)
    # The extension: a black rack under the seat's back half, out over the tail
    for side in (-1, 1):
        k.tube([(side * 0.1, 0.62, -0.2), (side * 0.11, 0.71, -0.55), (side * 0.1, 0.715, -0.93)], 0.012, "frame", seg=6, smooth=2)
        k.tube([(side * 0.1, 0.45, -0.38), (side * 0.11, 0.7, -0.75)], 0.011, "frame", seg=6)
    k.rod((-0.1, 0.715, -0.93), (0.1, 0.715, -0.93), 0.012, "frame", seg=6)
    # The short tail under the seat's end, the tail light's housing, the plate, the rear indicators
    k.box((0.12, 0.05, 0.12), (0, 0.69, -0.93), "trim", rot=(-0.1, 0, 0), bevel=0.01)
    k.beam((0, 0.67, -0.95), (0, 0.5, -1.0), (0.06, 0.014), "trim")
    E.plate(k, (0, 0.48, -1.01), size=(0.16, 0.12), lean=0.3)
    for side in (-1, 1):
        E.indicator(k, (side * 0.05, 0.66, -0.96), (side * 0.13, 0.665, -0.97), radius=0.01, stalk="trim")
    # Rear hugger over the wheel
    k.guard((REAR[1], REAR[2]), REAR_R + 0.025, 0.15, math.radians(10), math.radians(80), "trim", crown=0.02, nu=6)


def chassis(k):
    k.begin("body")
    head = (TOP[0] - 0.08, TOP[1] + 0.04)
    for side in (-1, 1):
        # A black steel spine and a loop each side down to the pivot
        k.tube([(side * 0.03, head[0], head[1]), (side * 0.08, 0.62, 0.05), (side * 0.1, 0.48, -0.1), (side * 0.1, PIVOT[0], PIVOT[1])], 0.018, "frame", seg=6, smooth=2)
        k.tube([(side * 0.03, head[0] - 0.06, head[1] + 0.02), (side * 0.07, 0.4, 0.22), (side * 0.09, 0.24, 0.05), (side * 0.1, PIVOT[0] - 0.04, PIVOT[1])], 0.014,
               "frame", seg=6, smooth=2)
    k.cylinder(0.034, 0.16, (0, head[0] - 0.02, head[1] + 0.01), "frame", rot=(-RAKE, 0, 0), seg=10)

    # The horizontal single: crankcases low, the barrel lying forward, the head at the front
    k.loft([(0.12, 0.2, 0.36, 0.08, 3, 3), (0.04, 0.18, 0.4, 0.11, 3, 3), (-0.12, 0.2, 0.4, 0.11, 3, 3), (-0.18, 0.24, 0.38, 0.08)], "casing", ring=14, steps=2)
    k.box((0.1, 0.1, 0.14), (0, 0.31, 0.2), "casing", rot=(1.35, 0, 0), bevel=0.012)
    k.box((0.12, 0.11, 0.07), (0, 0.31, 0.29), "dark_metal", rot=(1.35, 0, 0), bevel=0.012)
    k.lathe([(0, 0), (0.07, 0), (0.07, 0.016), (0.05, 0.03), (0, 0.032)], (0.112, 0.3, -0.04), "casing", axis="x", seg=18)

    parts.swingarm(k, pivot=PIVOT, axle=(REAR[1], REAR[2]), x=ARM_X, size=(0.03, 0.06), mat="frame", brace=False)
    k.rod((-0.13, PIVOT[0], PIVOT[1]), (0.13, PIVOT[0], PIVOT[1]), 0.018, "dark_metal", seg=10)
    k.rod((-0.12, REAR[1], REAR[2]), (0.12, REAR[1], REAR[2]), 0.011, "steel", seg=8)
    parts.shock(k, (0, 0.6, -0.22), (0, 0.34, -0.32), 0.032)
    parts.chain(k, x=-0.075, front=(0.3, -0.08, 0.03), rear=(REAR[1], REAR[2], 0.08))
    ra = math.radians(118)
    E.caliper(k, (RDISC_X, REAR[1], REAR[2]), RDISC_R, ra, size=(0.04, 0.045, 0.075), pistons=False)

    # A low silencer on the right, under the seat's front
    k.tube([(0.0, 0.31, 0.32), (0.06, 0.2, 0.3), (0.12, 0.18, 0.1), (0.14, 0.24, -0.15)], 0.02, "steel_dark", seg=7, smooth=3)
    parts.can(k, (0.14, 0.24, -0.15), (0.15, 0.34, -0.5), 0.05, "steel_dark", cap="dark_metal")

    parts.pegs(k, PEG, hanger=(0.4, -0.12), wide=0.06)
    k.side_stand((-0.11, 0.21, -0.06), (-0.24, 0.02, 0.0), 0.009, "steel_dark", seg=6)


def draw(k):
    wheels(k)
    front_end(k)
    bodywork(k)
    chassis(k)


def build():
    k = E.EKit(seed=117, colours=COLOURS, extra=EXTRA)
    for lod in E.LODS:
        k.level(lod)
        draw(k)
    k.finish_lods(OUT, {"grip": GRIP, "peg": PEG, "seat": SEAT})
    E.previews(k, NAME, height=0.55, reach=0.9)


build()
