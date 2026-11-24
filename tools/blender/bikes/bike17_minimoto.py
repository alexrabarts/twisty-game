# bike-17: Steve's mini moto, by the owner's word and his reference picture: a racing pocket bike that comes up to the
# rider's knees. Tiny wheels with fat slick tyres, a full race fairing over
# the whole bike with a small clear screen and a white oval number board on the nose, clip-on bars just behind the
# screen, a low seat on a short tail, and the pegs far back by the rear wheel, so the rider crouches over it with his
# knees out wide. Gloss black (the owner's choice for Steve), the number board white. No badges, no wordmark, no
# number on the board.
#
# Size, from the picture against the rider and the class's usual figures: 0.25 m wheels on 5 inch rims, a 0.70 m
# wheelbase, the seat 0.40 m up, the screen's top 0.52 m.
#   blender --background --factory-startup --python tools/blender/bikes/bike17_minimoto.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_E as E  # noqa: E402
import bike_parts as parts  # noqa: E402

NAME = "bike17_minimoto"
OUT = os.path.join(E.OUT_DIR, NAME + ".glb")
FRONT, REAR = (0, 0.125, 0.35), (0, 0.125, -0.35)
FRONT_R, REAR_R = 0.125, 0.125
RIM_F = RIM_R = 0.0635
RAKE = math.radians(24)
FORK_LEN = 0.3
TOP = (FRONT[1] + FORK_LEN * math.cos(RAKE), FRONT[2] - FORK_LEN * math.sin(RAKE))
FORK_X = 0.088
# The one front disc is on the left (-x as written here: the kit mirrors on export)
DISC_SIDE = -1
DISC_X, DISC_R = 0.058, 0.06
RDISC_X, RDISC_R = 0.066, 0.055
ARM_X = 0.082
# Clip-ons just behind the screen, the pegs far back by the rear wheel, the seat low on the tail
GRIP = (0.17, 0.43, 0.15)
PEG = (0.15, 0.25, -0.33)
SEAT = (0, 0.4, -0.1)
PIVOT = (0.2, -0.08)

COLOURS = {"paint": 0x161618, "paint_dark": 0x080809, "accent": 0x3A3C40, "rim": 0x141416, "caliper": 0x2B2C30, "spring": 0x2E3034,
           "trim": 0x151618, "seat": 0x101011, "plastic": 0xECECEC, "glass": 0x9AA4AC}
EXTRA = {
    "alu": (0x6C6F74, 0.4, 0.9),
    "casing": (0x2A2B2F, 0.5, 0.6),
    "frame": (0x101012, 0.45, 0.6),
}


def wheels(k):
    # Fat slicks on small spoked rims: no tread
    k.begin("wheel_front", FRONT)
    E.wheel(k, FRONT, FRONT_R, 0.095, RIM_F, spokes="cast", count=6, hub=0.025, tread=False)
    k.begin("wheel_rear", REAR)
    E.wheel(k, REAR, REAR_R, 0.11, RIM_R, spokes="cast", count=6, hub=0.025, tread=False)
    parts.sprocket(k, REAR, -0.06, 0.05)
    k.begin("disc_front", (DISC_SIDE * DISC_X, FRONT[1], FRONT[2]))
    k.disc((DISC_SIDE * DISC_X, FRONT[1], FRONT[2]), DISC_R, arms=4, thick=0.004)
    k.begin("disc_rear", (RDISC_X, REAR[1], REAR[2]))
    k.disc((RDISC_X, REAR[1], REAR[2]), RDISC_R, arms=4, thick=0.004)


def front_end(k):
    axle = (FRONT[1], FRONT[2])
    mid = E.along(axle, TOP, 0.5)
    for side, name in ((-1, "fork_left"), (1, "fork_right")):
        k.begin(name, (side * FORK_X, mid[0], mid[1]))
        E.usd_fork(k, side, axle, TOP, 0.016, 0.012, "trim", x=FORK_X, split=0.5,
                   disc=(DISC_X, DISC_R) if side == DISC_SIDE else None, caliper_angle=math.radians(205), caliper_size=(0.026, 0.03, 0.05))
    k.begin("body")
    E.yokes(k, FORK_X, axle, TOP, 0.04, lower=0.7)

    # Clip-ons: a short bar out from each fork leg's top, the grips and levers
    k.begin("handlebar", (0, TOP[0], TOP[1]))
    for side in (-1, 1):
        k.tube([(side * FORK_X, TOP[0] - 0.01, TOP[1] + 0.005), (side * 0.11, GRIP[1] + 0.005, GRIP[2] + 0.01), (side * (GRIP[0] + 0.05), GRIP[1], GRIP[2])], 0.009,
               "steel_dark", seg=8, smooth=2)
        E.lever_set(k, GRIP, side, 0.12)

    # A small round lamp under the number board, unlit by day
    k.begin("headlight", (0, 0.225, 0.4))
    k.cylinder(0.014, 0.012, (0, 0.225, 0.402), "headlight", axis="z", seg=12)

    k.begin("brake_light", (0, 0.4, -0.43))
    k.box((0.05, 0.02, 0.012), (0, 0.4, -0.432), "brake", rot=(-0.4, 0, 0), bevel=0.004)


def bodywork(k):
    k.begin("body")
    # The fairing: one shell from the pointed nose over the engine to under the seat, its top the tank's hump
    k.loft([(0.4, 0.24, 0.36, 0.05, 2.2, 2.2), (0.36, 0.215, 0.4, 0.09, 2.4, 2.4), (0.27, 0.17, 0.42, 0.115, 2.6, 2.6), (0.12, 0.12, 0.41, 0.125, 2.6, 2.6),
            (0.0, 0.12, 0.42, 0.12, 2.6, 2.6), (-0.1, 0.15, 0.4, 0.105, 2.6, 2.6)], "paint", ring=16, steps=3)
    # A belly pan under it
    k.loft([(0.22, 0.1, 0.16, 0.1, 3, 3), (0.0, 0.085, 0.15, 0.115, 3, 3), (-0.12, 0.12, 0.17, 0.08)], "paint", ring=12, steps=2)
    # The short tail under the seat, up to a point behind it
    k.loft([(-0.08, 0.3, 0.4, 0.11, 2.6, 2.6), (-0.22, 0.32, 0.41, 0.1, 2.6, 2.6), (-0.34, 0.36, 0.43, 0.07, 2.6, 2.6), (-0.43, 0.39, 0.43, 0.025)], "paint", ring=14,
           steps=2)
    # The seat pad on the tail's front, black
    k.loft([(-0.06, 0.395, 0.42, 0.06), (-0.12, 0.4, 0.425, 0.085, 3.4, 3), (-0.24, 0.405, 0.43, 0.08, 3.4, 3), (-0.29, 0.41, 0.43, 0.04)], "seat", ring=12, steps=2)

    # The white oval number board on the nose, leaning back with it, blank
    def board(u, v):
        a = u * 2 * math.pi
        r = 0.15 + 0.85 * v
        x = 0.08 * r * math.cos(a)
        y = 0.305 + 0.06 * r * math.sin(a)
        return (x, y, 0.428 - (y - 0.25) * 0.12 - 0.03 * (x / 0.08) ** 2)

    k.sheet(board, "plastic", nu=16, nv=2, thick=0.006)
    k.cylinder(0.015, 0.006, (0, 0.305, 0.4255), "plastic", axis="z", seg=10)
    # The small clear screen over the nose
    def screen(u, v):
        across = (v - 0.5) * 2
        y = 0.43 + 0.09 * u
        return (across * (0.09 - 0.03 * u), y, 0.27 - 0.16 * u - 0.025 * across * across)

    k.sheet(screen, "glass", nu=4, nv=6, thick=0.004)
    # Front mudguard close over the little wheel
    k.guard((FRONT[1], FRONT[2]), FRONT_R + 0.018, 0.1, math.radians(-20), math.radians(95), "paint", crown=0.015, nu=8)
    # The ducts' dark mouths each side of the nose
    for side in (-1, 1):
        E.panel(k, [(0.33, 0.22), (0.28, 0.25), (0.2, 0.22), (0.24, 0.18)], side * 0.128, 0.006, "trim", toe=side * -0.35, bevel=0)


def chassis(k):
    k.begin("body")
    head = (TOP[0] - 0.05, TOP[1] + 0.02)
    k.cylinder(0.022, 0.1, (0, head[0], head[1]), "frame", rot=(-RAKE, 0, 0), seg=10)
    for side in (-1, 1):
        k.tube([(side * 0.02, head[0], head[1]), (side * 0.06, 0.28, 0.08), (side * 0.07, PIVOT[0], PIVOT[1])], 0.012, "frame", seg=6, smooth=2)
    # The little single under the fairing's open back, the carburettor and the pull starter
    k.box((0.1, 0.1, 0.14), (0, 0.17, 0.0), "casing", bevel=0.01)
    k.cylinder(0.04, 0.03, (0.06, 0.17, -0.02), "casing", axis="x", seg=14)
    # Swingarm, shock, chain, rear caliper
    parts.swingarm(k, pivot=PIVOT, axle=(REAR[1], REAR[2]), x=ARM_X, size=(0.02, 0.035), mat="frame", brace=False)
    k.rod((-0.08, PIVOT[0], PIVOT[1]), (0.08, PIVOT[0], PIVOT[1]), 0.012, "dark_metal", seg=10)
    k.rod((-0.075, REAR[1], REAR[2]), (0.075, REAR[1], REAR[2]), 0.008, "steel", seg=8)
    parts.shock(k, (0, 0.34, -0.14), (0, 0.19, -0.24), 0.02)
    parts.chain(k, x=-0.06, front=(0.17, -0.04, 0.02), rear=(REAR[1], REAR[2], 0.05))
    E.caliper(k, (RDISC_X, REAR[1], REAR[2]), RDISC_R, math.radians(118), size=(0.026, 0.03, 0.05), pistons=False)
    # A short silencer tucked under the tail on the right
    k.tube([(0.03, 0.15, 0.05), (0.08, 0.13, -0.08), (0.09, 0.2, -0.2)], 0.012, "steel_dark", seg=7, smooth=2)
    parts.can(k, (0.09, 0.2, -0.2), (0.095, 0.27, -0.36), 0.026, "steel_dark", cap="dark_metal")
    parts.pegs(k, PEG, hanger=(0.28, -0.26), wide=0.04)


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
    E.previews(k, NAME, height=0.3, reach=0.6)


build()
