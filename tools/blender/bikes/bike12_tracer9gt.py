# bike-12: the sports tourer triple from the trip photos, in silver over
# gloss black: a black nose with twin small LED eyes low in its corners and
# light strips over them, a tall adjustable screen, silver tank covers, black
# side fairings with a blue stripe, a dark cast aluminium frame, a black
# inline triple whose bronze headers run down the front into a collector
# under the engine and a short silencer low on the right, gold upside-down
# forks, blue ten-spoke cast wheels with dark spokes, a two-level seat, hand
# guards, and the luggage it carried: a black dry bag across the rack and
# a grey bag with hi-vis trim on the pillion seat.
#
# Real size: 1,500 mm wheelbase, 810 mm seat, 120/70-17 and 180/55-17
# tyres, twin 298 mm front discs, a 267 mm rear disc, 25 degrees of rake.
#   blender --background --factory-startup --python tools/blender/bikes/bike12_tracer9gt.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_D as D  # noqa: E402
import bike_parts as parts  # noqa: E402

OUT = os.path.join(D.OUT_DIR, "bike12_tracer9gt.glb")
FRONT, REAR = (0, 0.3, 0.75), (0, 0.315, -0.75)
FRONT_R, REAR_R = 0.3, 0.315
RAKE = math.radians(25)
FORK_LEN = 0.76
TOP = (FRONT[1] + FORK_LEN * math.cos(RAKE), FRONT[2] - FORK_LEN * math.sin(RAKE))
FORK_X = 0.1
DISC_X, DISC_R = 0.064, 0.149
RDISC_X, RDISC_R = 0.08, 0.1335
GRIP = (0.36, 1.1, 0.32)
PEG = (0.2, 0.37, -0.1)
SEAT = (0, 0.82, -0.2)
PIVOT = (0.47, -0.15)

# `pillion` is the bag's hi-vis trim: this bike's seat is one black finish
COLOURS = {"paint": 0xA8ABB1, "paint_dark": 0x141519, "accent": 0x2A55D0, "rim": 0x2D43B8, "caliper": 0x2D2F33, "fork_gold": 0xC9A23C,
           "copper": 0x8E6444, "plastic": 0x9AA0A5, "pillion": 0xB6DA24, "luggage": 0x16171A, "plate": 0xE8C22C, "trim": 0x18191C, "spring": 0x2D4AB0}


def wheels(k):
    k.begin("wheel_front", FRONT)
    D.wheel(k, FRONT, FRONT_R, 0.12, 0.216, spokes="cast", count=10, hub=0.045, spoke_mat="dark_metal")
    k.begin("wheel_rear", REAR)
    D.wheel(k, REAR, REAR_R, 0.18, 0.216, spokes="cast", count=10, hub=0.05, spoke_mat="dark_metal")
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
        D.usd_fork(k, side, axle, TOP, 0.028, 0.022, "fork_gold", inner_mat="chrome", x=FORK_X, disc=(DISC_X, DISC_R),
                   caliper_size=(0.05, 0.06, 0.11), adjuster="fork_gold")
    k.begin("body")
    D.yokes(k, FORK_X, axle, TOP, 0.09)
    k.guard((FRONT[1], FRONT[2]), FRONT_R + 0.028, 0.14, math.radians(25), math.radians(128), "trim", crown=0.03, nu=10)

    k.begin("handlebar", (0, 1.06, 0.42))
    for side in (-1, 1):
        g = (side * GRIP[0], GRIP[1], GRIP[2])
        k.tube([(0, 1.06, 0.42), (side * 0.1, 1.065, 0.42), (side * 0.24, 1.09, 0.37), D.along(g, (side * 0.45, GRIP[1], GRIP[2] - 0.02), 0.5)],
               [0.014, 0.014, 0.011, 0.011], "dark_metal", seg=8, smooth=2)
        D.lever_set(k, GRIP, side, 0.24)
        D.hand_guard(k, GRIP, side, mat="trim")
        k.cylinder(0.018, 0.05, (side * 0.05, 1.04, 0.43), "steel_dark", seg=8)
    D.mirror(k, (0.24, 1.1, 0.4), (0.35, 1.26, 0.45), size=(0.08, 0.042))

    # Twin small LED eyes low in the nose's corners, a light strip over each
    k.begin("headlight", (0, 0.9, 0.81))
    for side in (-1, 1):
        k.box((0.06, 0.035, 0.016), (side * 0.075, 0.885, 0.808), "headlight", rot=(-0.3, 0, side * 0.45), bevel=0.008)
        k.box((0.075, 0.008, 0.01), (side * 0.07, 0.925, 0.83), "headlight", rot=(-0.3, 0, side * 0.55), bevel=0.002)

    k.begin("brake_light", (0, 0.88, -0.925))
    k.box((0.12, 0.03, 0.025), (0, 0.88, -0.925), "brake", rot=(0.45, 0, 0), bevel=0.008)


def bodywork(k):
    k.begin("body")

    # Nose: gloss black, silver along its upper flanks where it meets the tank
    def nose(u, up, side):
        return "paint" if (u < 0.35 and up > 0.2 and abs(side) > 0.3) else "paint_dark"

    k.loft([(0.45, 0.8, 1.06, 0.2, 3.0, 3.0), (0.6, 0.8, 1.05, 0.19, 3.4, 3.0), (0.72, 0.83, 1.0, 0.16, 3.6, 3.0, 0.55), (0.8, 0.86, 0.97, 0.115, 3.6, 3.0, 0.55),
            (0.86, 0.9, 0.945, 0.05, 3.0, 3.0, 0.55), (0.88, 0.915, 0.935, 0.012)], nose, ring=20, steps=3, sharp=35)
    # A black chin under the eyes, pointed at the front
    k.loft([(0.6, 0.72, 0.84, 0.14), (0.72, 0.75, 0.84, 0.12, 3, 2), (0.8, 0.79, 0.85, 0.08, 3, 2), (0.83, 0.81, 0.85, 0.03)], "paint_dark", ring=12, steps=2)

    # Tall screen and its frame, the instruments behind it
    def screen(u, v):
        across = (v - 0.5) * 2
        half = 0.17 - 0.045 * u
        return (across * half, 1.0 + 0.4 * u, 0.79 - 0.2 * u ** 1.2 - 0.05 * across * across)

    k.sheet(screen, "glass", nu=6, nv=6, thick=0.006)
    for side in (-1, 1):
        k.rod((side * 0.11, 1.0, 0.69), (side * 0.12, 1.15, 0.7), 0.009, "dark_metal", seg=6)
        D.indicator(k, (side * 0.17, 0.9, 0.7), (side * 0.205, 0.895, 0.71), radius=0.01)
    k.box((0.24, 0.14, 0.035), (0, 1.1, 0.6), "dark_metal", rot=(-0.6, 0, 0), bevel=0.01)
    k.box((0.2, 0.1, 0.006), (0, 1.108, 0.585), "dash", rot=(-0.6, 0, 0), bevel=0)

    # Silver tank covers
    k.loft([
        (-0.04, 0.8, 0.88, 0.1),
        (0.06, 0.76, 0.96, 0.18, 3.0, 3.4),
        (0.2, 0.74, 1.02, 0.205, 3.2, 3.6, 0.5, 0.82),
        (0.36, 0.76, 1.045, 0.2, 3.2, 3.6, 0.5, 0.82),
        (0.48, 0.81, 1.04, 0.18),
    ], "paint", ring=24, steps=3)
    k.cylinder(0.035, 0.01, (0, 1.045, 0.28), "steel_dark", seg=12)

    # Black side fairings with a blue stripe; a silver panel under the seat
    for side in (-1, 1):
        x = side * 0.205
        D.panel(k, [(0.74, 0.94), (0.83, 0.87), (0.66, 0.6), (0.5, 0.5), (0.38, 0.55), (0.48, 0.76), (0.6, 0.88)], x, 0.02, "paint_dark", toe=-side * 0.2)
        # The tank's silver dropping down its flank toward the engine
        D.panel(k, [(0.42, 0.84), (0.48, 0.76), (0.4, 0.6), (0.12, 0.6), (0.0, 0.7), (0.05, 0.78)], side * 0.185, 0.016, "paint", toe=-side * 0.05)
        D.panel(k, [(0.7, 0.82), (0.72, 0.795), (0.42, 0.71), (0.4, 0.735)], x + side * 0.012, 0.005, "accent", toe=-side * 0.2, bevel=0.0015)
        D.panel(k, [(0.04, 0.75), (-0.26, 0.8), (-0.32, 0.73), (-0.02, 0.62)], side * 0.155, 0.014, "paint")
    k.box((0.36, 0.3, 0.05), (0, 0.64, 0.48), "dark_metal", rot=(-0.3, 0, 0), bevel=0.01)
    k.box((0.32, 0.26, 0.01), (0, 0.64, 0.507), "vent", rot=(-0.3, 0, 0), bevel=0)

    # Two-level seat and the tail
    k.loft([(0.02, 0.79, 0.85, 0.12), (-0.08, 0.78, 0.83, 0.17, 3, 3), (-0.3, 0.785, 0.835, 0.16, 3, 3), (-0.4, 0.8, 0.85, 0.13)], "seat", ring=14, steps=2)
    k.loft([(-0.38, 0.84, 0.9, 0.12), (-0.45, 0.85, 0.93, 0.15, 3, 3), (-0.68, 0.87, 0.94, 0.14, 3, 3), (-0.76, 0.88, 0.93, 0.1)], "seat", ring=14, steps=2)
    k.loft([(-0.1, 0.64, 0.8, 0.15), (-0.4, 0.7, 0.85, 0.15, 3, 3), (-0.7, 0.79, 0.89, 0.12, 3, 3), (-0.9, 0.84, 0.9, 0.06, 3, 3), (-0.95, 0.86, 0.89, 0.02)],
           "trim", ring=14, steps=2)
    k.guard((REAR[1], REAR[2]), REAR_R + 0.03, 0.19, math.radians(70), math.radians(120), "trim", crown=0.03, nu=6)
    k.beam((0, 0.84, -0.86), (0, 0.66, -0.99), (0.07, 0.024), "trim")
    D.plate(k, (0, 0.61, -1.0), size=(0.2, 0.15), lean=0.3)
    for side in (-1, 1):
        D.indicator(k, (side * 0.03, 0.72, -0.94), (side * 0.14, 0.725, -0.945), radius=0.01)
        # Grab handles each side of the tail, the rack across them
        k.tube([(side * 0.15, 0.88, -0.5), (side * 0.17, 0.92, -0.7), (side * 0.13, 0.94, -0.88), (side * 0.04, 0.945, -0.9)], 0.013, "dark_metal", seg=7, smooth=2)
    k.box((0.3, 0.016, 0.3), (0, 0.945, -0.76), "dark_metal", bevel=0.005)


def frame(k):
    k.begin("body")
    # Cast aluminium frame in satin black: broad spars from the headstock to
    # the pivot, plates round the pivot, a tubular subframe to the tail
    k.cylinder(0.042, 0.19, (0, 0.92, 0.42), "trim", rot=(-RAKE, 0, 0), seg=12)
    for side in (-1, 1):
        k.beam((side * 0.06, 0.93, 0.4), (side * 0.15, 0.74, 0.08), (0.05, 0.1), "trim", bevel=0.012)
        k.beam((side * 0.15, 0.76, 0.1), (side * 0.15, 0.52, -0.16), (0.05, 0.12), "trim", bevel=0.012)
        D.panel(k, [(-0.04, 0.62), (-0.2, 0.6), (-0.23, 0.4), (-0.12, 0.33), (-0.03, 0.42)], side * 0.15, 0.03, "trim")
        k.tube([(side * 0.14, 0.7, -0.12), (side * 0.13, 0.8, -0.5), (side * 0.1, 0.84, -0.85)], 0.014, "dark_metal", seg=7, smooth=2)
        k.rod((side * 0.15, 0.55, -0.18), (side * 0.13, 0.76, -0.45), 0.012, "dark_metal", seg=6)


def engine(k):
    k.begin("body")
    # Inline triple: crankcase, a forward-leaning block, head and cam cover
    k.box((0.34, 0.25, 0.44), (0, 0.37, 0.06), "dark_metal", bevel=0.03)
    k.box((0.33, 0.22, 0.18), (0, 0.58, 0.21), "dark_metal", rot=(-0.35, 0, 0), bevel=0.02)
    k.box((0.33, 0.1, 0.18), (0, 0.72, 0.26), "dark_metal", rot=(-0.35, 0, 0), bevel=0.02)
    k.box((0.28, 0.04, 0.15), (0, 0.78, 0.28), "steel_dark", rot=(-0.35, 0, 0), bevel=0.012)
    k.lathe([(0, 0), (0.1, 0), (0.1, 0.02), (0.075, 0.04), (0, 0.042)], (0.17, 0.37, 0.03), "dark_metal", axis="x", seg=18)
    k.lathe([(0, 0), (0.045, 0), (0.045, 0.012), (0, 0.012)], (0.214, 0.37, 0.03), "steel_dark", axis="x", seg=10)
    k.lathe([(0, 0), (0.09, 0), (0.09, 0.02), (0.065, 0.035), (0, 0.035)], (-0.17, 0.39, 0.12), "dark_metal", axis="x", rot=(0, 0, math.pi), seg=16)
    D.panel(k, [(-0.05, 0.48), (-0.18, 0.46), (-0.19, 0.34), (-0.05, 0.32)], -0.18, 0.02, "dark_metal")
    # Bronze headers down the front into a collector under the engine, and
    # a short black silencer low on the right
    for x in (-0.08, 0.0, 0.08):
        k.tube([(x, 0.72, 0.36), (x * 1.05, 0.58, 0.45), (x, 0.38, 0.42), (x * 0.6 + 0.02, 0.2, 0.28), (0.03, 0.15, 0.1)], 0.021, "copper", seg=8, smooth=3)
    k.loft([(0.16, 0.12, 0.2, 0.05), (0.1, 0.11, 0.21, 0.09, 3, 3), (-0.08, 0.12, 0.22, 0.1, 3, 3), (-0.14, 0.14, 0.22, 0.07)], "copper", ring=12, steps=2)
    k.loft([(-0.08, 0.15, 0.27, 0.05, 3, 3, 0.5, 1, 1, 0.12), (-0.14, 0.15, 0.3, 0.07, 3.4, 3.4, 0.5, 1, 1, 0.14),
            (-0.36, 0.2, 0.34, 0.07, 3.4, 3.4, 0.5, 1, 1, 0.16), (-0.42, 0.23, 0.33, 0.05, 3, 3, 0.5, 1, 1, 0.165)], "dark_metal", ring=12, steps=2)
    k.cylinder(0.03, 0.012, (0.165, 0.28, -0.425), "steel", axis="z", seg=10)


def chassis(k):
    k.begin("body")
    for side in (-1, 1):
        k.loft([(PIVOT[1] + 0.02, 0.42, 0.53, 0.024, 3, 3, 0.5, 1, 1, side * 0.118), (PIVOT[1] - 0.15, 0.4, 0.51, 0.024, 3, 3, 0.5, 1, 1, side * 0.12),
                (REAR[2] + 0.02, 0.29, 0.35, 0.02, 3, 3, 0.5, 1, 1, side * 0.117), (REAR[2] - 0.05, 0.295, 0.34, 0.018, 3, 3, 0.5, 1, 1, side * 0.117)],
               "trim", ring=10, steps=2)
        k.box((0.02, 0.045, 0.07), (side * 0.133, REAR[1], REAR[2]), "steel", bevel=0.006)
    k.box((0.23, 0.05, 0.08), (0, 0.46, PIVOT[1] - 0.15), "trim", bevel=0.012)
    k.rod((-0.17, PIVOT[0], PIVOT[1]), (0.17, PIVOT[0], PIVOT[1]), 0.02, "dark_metal", seg=10)
    k.rod((-0.14, REAR[1], REAR[2]), (0.14, REAR[1], REAR[2]), 0.012, "steel", seg=8)
    parts.chain(k, x=-0.1, front=(0.41, -0.06, 0.045), rear=(REAR[1], REAR[2], 0.1))
    parts.shock(k, (0.0, 0.74, -0.18), (0.0, 0.43, -0.32), 0.032)
    D.caliper(k, (RDISC_X, REAR[1], REAR[2]), RDISC_R, math.radians(205), size=(0.045, 0.055, 0.09))
    parts.pegs(k, PEG, hanger=(0.54, -0.1), wide=0.055)
    for side in (-1, 1):
        D.panel(k, [(-0.02, 0.56), (-0.14, 0.52), (-0.16, 0.38), (-0.1, 0.36)], side * 0.18, 0.012, "steel")
    k.side_stand((-0.15, 0.28, -0.05), (-0.29, 0.03, 0.06), 0.012, "steel_dark", seg=6)


def luggage(k):
    k.begin("body")
    # Black dry bag across the rack
    D.roll_bag(k, (0, 1.08, -0.8), 0.5, 0.13, mat="luggage", strap="dark_metal")
    # Grey bag with hi-vis trim on the pillion seat
    k.box((0.34, 0.22, 0.26), (0, 1.05, -0.52), "plastic", bevel=0.03)
    for y in (0.945, 1.155):
        k.box((0.35, 0.014, 0.27), (0, y, -0.52), "pillion", bevel=0.004)
    for x in (-0.172, 0.172):
        k.box((0.006, 0.2, 0.012), (x, 1.05, -0.47), "pillion", bevel=0)


def draw(k):
    wheels(k)
    front_end(k)
    bodywork(k)
    frame(k)
    engine(k)
    chassis(k)
    luggage(k)


def build():
    k = D.DKit(seed=112, colours=COLOURS)
    k.colours["paint"] = (COLOURS["paint"], 0.25, 0.8)
    for lod in D.LODS:
        k.level(lod)
        draw(k)
    k.finish_lods(OUT, {"grip": GRIP, "peg": PEG, "seat": SEAT})
    D.previews(k, "bike12_tracer9gt", height=0.65)


build()
