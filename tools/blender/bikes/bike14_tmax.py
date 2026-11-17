# bike-14: Tim's big super scooter. No photo of his exists, so this is a
# generic current 560 cc sports maxi scooter in a dark scheme: dark grey
# metallic panels over black lower bodywork, a thin bronze accent, dark
# wheels. A large front cowl with twin slim LED headlights and a tall
# screen, an exposed handlebar, a high central tunnel between flat
# footboards whose front ends slope up for the feet-forward position, a
# long two-level seat with an adjustable backrest for the rider, the bulk
# of the under-seat body, a parallel twin carried low in the frame (not on
# the swingarm, as on a small scooter), a cast aluminium swingarm with the
# belt drive on its left (no chain), the silencer on the right, twin front
# discs with radial calipers on 15-inch wheels. No badges, no plate.
#
# Real size (the 2022 model's published figures): 1,575 mm wheelbase,
# 2,195 mm long, 800 mm seat, 26 degrees of caster, 120/70-15 and
# 160/60-15 tyres, twin 267 mm front discs, a 282 mm rear disc.
#
# The rider sits as on the game's maxi scooter (tools/blender/bike_scooter.py):
# upright, the hands on a bar high and close, the feet forward on the
# boards rather than under the hips on pegs. `peg` is where the boot rests
# on the board's sloping front end.
#   blender --background --factory-startup --python tools/blender/bikes/bike14_tmax.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_E as E  # noqa: E402
import bike_parts as parts  # noqa: E402

OUT = os.path.join(E.OUT_DIR, "bike14_tmax.glb")
FRONT, REAR = (0, 0.2745, 0.7875), (0, 0.2865, -0.7875)
FRONT_R, REAR_R = 0.2745, 0.2865
RIM = 0.1905
RAKE = math.radians(26.0)
FORK_LEN = 0.62
TOP = (FRONT[1] + FORK_LEN * math.cos(RAKE), FRONT[2] - FORK_LEN * math.sin(RAKE))
FORK_X = 0.1
DISC_X, DISC_R = 0.062, 0.1335
# The rear disc is on the right, opposite the belt
RDISC_X, RDISC_R = 0.07, 0.141
GRIP = (0.315, 1.065, 0.37)
PEG = (0.17, 0.47, 0.3)
SEAT = (0, 0.8, -0.2)
# Swingarm pivot (y, z), under the engine's rear
PIVOT = (0.33, -0.2)

COLOURS = {"paint": 0x3A3D42, "paint_dark": 0x1E2023, "accent": 0x9C7A4E, "rim": 0x232427, "caliper": 0x2A2B2E, "spring": 0x2A2B2E,
           "trim": 0x141517, "glass": 0x2A3036, "seat": 0x18181B, "pillion": 0x1D1D20}
EXTRA = {
    # The thin accent: a dark bronze line on the panels and the rims
    "bronze": (0x8C6A42, 0.3, 0.8),
    "alu": (0x8A8D92, 0.36, 0.9),
    "casing": (0x26272A, 0.5, 0.6),
}


def wheels(k):
    for name, centre, radius, width, hub in (("wheel_front", FRONT, FRONT_R, 0.12, 0.045), ("wheel_rear", REAR, REAR_R, 0.16, 0.05)):
        k.begin(name, centre)
        E.wheel(k, centre, radius, width, RIM, spokes="cast", count=5, pair=True, hub=hub, sweep=0.1, hub_width=0.045)
        # A bronze stripe round each rim's outer lip
        for side in (-1, 1):
            k.lathe([(RIM + 0.002, side * width * 0.455), (RIM - 0.008, side * width * 0.462)], centre, "bronze", axis="x", seg=24 if k.low else 48, solid=0.002)
    k.begin("disc_front", (DISC_X, FRONT[1], FRONT[2]))
    k.disc((DISC_X, FRONT[1], FRONT[2]), DISC_R, arms=6)
    k.disc((-DISC_X, FRONT[1], FRONT[2]), DISC_R, arms=6)
    k.begin("disc_rear", (RDISC_X, REAR[1], REAR[2]))
    k.disc((RDISC_X, REAR[1], REAR[2]), RDISC_R, arms=6)


def front_end(k):
    axle = (FRONT[1], FRONT[2])
    mid = E.along(axle, TOP, 0.5)
    for side, name in ((-1, "fork_left"), (1, "fork_right")):
        k.begin(name, (side * FORK_X, mid[0], mid[1]))
        a = (side * FORK_X, axle[0], axle[1])
        b = (side * FORK_X, TOP[0], TOP[1])
        # Conventional fork: dark sliders below, the stanchions above, mostly
        # inside the cowl
        k.box((0.06, 0.07, 0.07), E.along(a, b, 0.01), "casing", bevel=0.012)
        k.rod(E.along(a, b, 0.02), E.along(a, b, 0.45), 0.031, "casing", seg=14)
        k.rod(E.along(a, b, 0.44), b, 0.0215, "chrome", seg=12)
        # Radial caliper behind the leg, on its bracket
        ca = math.radians(205)
        cr = DISC_R * 0.86
        cat = (side * DISC_X, axle[0] + math.sin(ca) * cr, axle[1] + math.cos(ca) * cr)
        k.beam((side * (FORK_X - 0.005), axle[0] + 0.01, axle[1] - 0.02), (side * (DISC_X + 0.03), cat[1], cat[2]), (0.02, 0.03), "casing", bevel=0.004)
        E.caliper(k, (side * DISC_X, axle[0], axle[1]), DISC_R, ca, size=(0.048, 0.055, 0.1))
    k.begin("body")
    E.yokes(k, FORK_X, axle, TOP, 0.08)
    # Front mudguard: dark, with a long beak forward
    k.guard((FRONT[1], FRONT[2]), FRONT_R + 0.03, 0.15, math.radians(25), math.radians(150), "paint", crown=0.03, nu=12)
    for side in (-1, 1):
        k.panel([(0.88, 0.36), (0.83, 0.47), (0.72, 0.5), (0.68, 0.42), (0.76, 0.36)], side * 0.045, 0.006, "trim", bevel=0.002)

    # Exposed handlebar on risers, with the grips and levers, and its
    # switchgear; mirrors on the bar
    k.begin("handlebar", (0, 1.04, 0.42))
    clamp = (1.035, 0.42)
    for side in (-1, 1):
        g = (side * GRIP[0], GRIP[1], GRIP[2])
        k.tube([(0, clamp[0], clamp[1]), (side * 0.08, clamp[0] + 0.005, clamp[1]), (side * 0.2, GRIP[1] - 0.005, GRIP[2] + 0.03),
                (side * (GRIP[0] + 0.07), GRIP[1], GRIP[2] - 0.01)], 0.012, "dark_metal", seg=8, smooth=2)
        E.lever_set(k, GRIP, side, 0.2)
        k.cylinder(0.02, 0.06, (side * 0.05, clamp[0] - 0.03, clamp[1]), "casing", seg=8)
        # Mirror on a stalk from the bar
        root = (side * 0.24, GRIP[1] + 0.01, GRIP[2] + 0.04)
        head = (side * 0.34, 1.24, 0.42)
        k.tube([root, E.along(root, head, 0.5), head], 0.008, "trim", seg=6, smooth=2)
        k.loft([(0.4, 1.205, 1.265, 0.04, 2.4, 2.4, 0.5, 1, 1, side * 0.37), (0.415, 1.195, 1.28, 0.07, 3.2, 3.2, 0.5, 1, 1, side * 0.37),
                (0.44, 1.198, 1.275, 0.065, 3.2, 3.2, 0.5, 1, 1, side * 0.37), (0.45, 1.21, 1.26, 0.045, 2.4, 2.4, 0.5, 1, 1, side * 0.37)], "trim", ring=12, steps=1)
        k.box((0.12, 0.06, 0.004), (side * 0.37, 1.237, 0.398), "chrome", bevel=0)
    k.box((0.07, 0.04, 0.06), (0, clamp[0] + 0.02, clamp[1]), "casing", bevel=0.008)

    # Twin slim LED headlights high in the cowl, angled up and out like a
    # pair of narrowed eyes, the running lights above them
    k.begin("headlight", (0, 0.86, 0.95))
    for side in (-1, 1):
        k.box((0.13, 0.03, 0.016), (side * 0.072, 0.862, 0.952), "headlight", rot=(-0.75, side * 0.6, side * -0.32), bevel=0.006)
        k.box((0.12, 0.008, 0.01), (side * 0.078, 0.888, 0.938), "headlight", rot=(-0.75, side * 0.6, side * -0.42), bevel=0.002)

    k.begin("brake_light", (0, 0.86, -1.1))
    k.loft([(-1.075, 0.835, 0.885, 0.1, 3, 3), (-1.1, 0.84, 0.88, 0.085, 3, 3), (-1.11, 0.845, 0.875, 0.05)], "brake", ring=12, steps=1)


def floor_x(z, y):
    """How far out the floor's side stands: tucked in toward the bottom."""
    v = min(1.0, max(0.0, (0.415 - y) / 0.21))
    return 0.282 - 0.05 * v * v


def flank_x(z, y):
    """How far out the under-seat flank stands at a point of its side view: broadest a third of
    the way back, narrowing to the tail, a little rounded top to bottom, with a sharp crease
    running up toward the tail just above the bronze line: the face above it leans in, the face
    below stands upright."""
    u = min(1.0, max(0.0, -z / 1.09))
    mid = 0.4 + 0.33 * u
    v = min(1.0, max(0.0, (y - 0.41) / 0.45))
    base = (0.205 + 0.045 * math.sin(math.pi * min(1.0, u * 1.7)) - 0.13 * u ** 2.2) * (1 - 0.1 * ((v - mid) / 0.6) ** 2)
    crease = 0.645 + max(0.0, -z - 0.12) * 0.244
    d = y - crease
    fade = min(1.0, max(0.0, (-z - 0.02) / 0.12)) * min(1.0, max(0.0, (1.06 + z) / 0.12))
    ridge = 0.022 * (max(0.0, 1 - d / 0.13) if d > 0 else max(0.0, 1 + d / 0.07))
    return base + ridge * fade


# The front cowl's cross-sections (bike_kit.Kit.loft), shared with cowl_x
COWL = [
    (0.48, 0.42, 1.06, 0.28, 1.6, 2.6, 0.45, 0.5, 0.9),
    (0.6, 0.56, 1.09, 0.29, 1.4, 2.6, 0.42, 0.4, 0.85),
    (0.72, 0.6, 1.07, 0.26, 1.3, 2.4, 0.4, 0.32, 0.8),
    (0.84, 0.635, 1.0, 0.2, 1.3, 2.2, 0.4, 0.28, 0.75),
    (0.94, 0.69, 0.95, 0.125, 1.3, 2.0, 0.42, 0.28, 0.7),
    (1.02, 0.75, 0.905, 0.06, 1.4, 1.8, 0.45, 0.3, 0.65),
]


def cowl_x(z, y):
    """The cowl's half-width at a point of its side view, from its sections taken as straight
    between one another (the loft's spline bulges a little past this)."""
    for a, b in zip(COWL, COWL[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            break
    else:
        a = b = COWL[0] if z < COWL[0][0] else COWL[-1]
        t = 0.0
    s_ = [p + (q - p) * t for p, q in zip(a, b)]
    _, lo, hi, w, nt, nb, mid, wt, wb = s_
    centre = lo + (hi - lo) * mid
    if y >= centre:
        py, n, narrow = min(1.0, (y - centre) / (hi - centre)), nt, wt
    else:
        py, n, narrow = min(1.0, (centre - y) / (centre - lo)), nb, wb
    px = max(0.0, 1 - py ** n) ** (1 / n)
    return w * px * (1 - (1 - narrow) * py)


def bodywork(k):
    k.begin("body")

    # Front cowl: a pointed nose over the front wheel that rises and widens
    # back to the screen and the leg shield, its widest line high, the
    # wheel well open under it. Paint above, a black band across the face
    # for the lights, a dark intake low in the middle, black underneath.
    def cowl(u, up, side):
        if u > 0.72 and 0.1 < up < 0.75 and abs(side) < 0.85:
            return "trim"
        if u > 0.7 and up < -0.35 and abs(side) < 0.55:
            return "vent"
        if up < -0.85:
            return "trim"
        return "paint"

    k.loft(COWL + [
        (1.07, 0.8, 0.87, 0.012),
    ], cowl, ring=30, steps=4, sharp=25)
    # A raised, sharp-edged cheek panel on each side of the cowl, its upper
    # edge a crease from the headlights back to the leg shield, the bronze
    # line along that edge
    for side in (-1, 1):
        def cheek(z, y):
            top = 0.84 + (1.0 - z) * 0.2
            return cowl_x(z, y) + 0.004 + 0.016 * max(0.0, min(1.0, 1 - (top - y) / 0.2))

        E.band(k, [(0.92, 0.87), (0.82, 0.91), (0.7, 0.93), (0.57, 0.92)], [(0.94, 0.735), (0.84, 0.695), (0.7, 0.665), (0.57, 0.625)], cheek, side, "paint",
               nu=14, nv=6, lift=0.006, thick=0.01, sharp=25)
        E.band(k, [(0.92, 0.878), (0.82, 0.918), (0.7, 0.938), (0.58, 0.928)], [(0.92, 0.866), (0.82, 0.906), (0.7, 0.926), (0.58, 0.916)], cheek, side, "bronze",
               nu=10, lift=0.016, thick=0.004)
    # Front indicators at the cowl's lower corners
    for side in (-1, 1):
        k.box((0.06, 0.016, 0.035), (side * 0.215, 0.665, 0.8), "signal", rot=(0, side * 0.75, 0), bevel=0.006)

    # Inner leg shield behind the cowl, black, with its glovebox lids, the
    # meter panel above it
    k.loft([(0.4, 0.42, 1.0, 0.25, 3, 3), (0.47, 0.42, 1.08, 0.28, 3, 3), (0.5, 0.44, 1.1, 0.285)], "trim", ring=18, steps=1)
    k.box((0.36, 0.14, 0.04), (0, 1.1, 0.52), "trim", rot=(-1.0, 0, 0), bevel=0.012)
    k.box((0.28, 0.1, 0.004), (0, 1.11, 0.5), "dash", rot=(-1.0, 0, 0), bevel=0)
    for side in (-1, 1):
        k.box((0.13, 0.17, 0.01), (side * 0.14, 0.86, 0.405), "casing", rot=(-0.25, 0, 0), bevel=0.006)

    # Screen: short, pointed at the top, raked back
    def screen(u, v):
        across = (v - 0.5) * 2
        half = 0.24 - 0.13 * u ** 1.4
        return (across * half, 1.035 + 0.36 * u - 0.035 * across * across, 0.85 - 0.29 * u ** 1.1 - 0.05 * across * across)

    k.sheet(screen, "glass", nu=7, nv=8, thick=0.006)

    # High central tunnel between the boards, dark grey with a black spine
    k.loft([
        (0.44, 0.42, 0.86, 0.11, 3, 3),
        (0.32, 0.42, 0.74, 0.125, 3, 3),
        (0.14, 0.42, 0.69, 0.13, 3, 3),
        (-0.02, 0.42, 0.72, 0.14, 3, 3),
        (-0.08, 0.44, 0.77, 0.15),
    ], lambda u, up, side: "trim" if up > 0.9 else "paint", ring=16, steps=2)

    # Floor: the boards on top, flat, with rubber mats, their front ends
    # sloping up into the leg shield for the feet-forward position; the
    # floor's sides drop to a black skirt with a bronze line on its edge
    for side in (-1, 1):
        x = side * 0.2
        k.box((0.16, 0.02, 0.5), (x, 0.41, 0.08), "trim", bevel=0.006)
        k.box((0.16, 0.02, 0.2), (x, 0.47, 0.4), "trim", rot=(-0.62, 0, 0), bevel=0.006)
        if not k.low:
            for dx in (-0.05, 0.0, 0.05):
                k.box((0.028, 0.006, 0.44), (x + dx, 0.422, 0.07), "rubber", bevel=0)
                k.box((0.028, 0.006, 0.16), (x + dx, 0.479, 0.398), "rubber", rot=(-0.62, 0, 0), bevel=0)

        E.coons(k, [(0.48, 0.42), (0.2, 0.415), (-0.08, 0.415)], [(0.42, 0.22), (0.1, 0.19), (-0.14, 0.2)],
                [(0.48, 0.42), (0.45, 0.32), (0.42, 0.22)], [(-0.08, 0.415), (-0.11, 0.3), (-0.14, 0.2)],
                lambda u, v, z, y, side=side: side * floor_x(z, y), "trim", nu=10, nv=6, thick=0.012)
        E.band(k, [(0.47, 0.405), (0.2, 0.4), (-0.09, 0.4)], [(0.465, 0.39), (0.2, 0.385), (-0.095, 0.385)], floor_x, side, "bronze", nu=6)
    # Under the floor, between the skirts
    k.box((0.44, 0.1, 0.54), (0, 0.27, 0.15), "trim", bevel=0.02)

    # Under-seat body: a broad flank each side from the floor's rear up and
    # back to the tail, its lower edge climbing away from the rear wheel and
    # the drive. Dark grey, a bronze line along the flank, a black vent low
    # at the front, black along the bottom edge.
    top = [(0.0, 0.76), (-0.2, 0.77), (-0.45, 0.8), (-0.7, 0.85), (-0.95, 0.9), (-1.08, 0.91)]
    rear = [(-1.08, 0.91), (-1.11, 0.86), (-1.09, 0.8)]
    bottom = [(-0.06, 0.415), (-0.16, 0.43), (-0.32, 0.5), (-0.55, 0.61), (-0.8, 0.7), (-1.09, 0.8)]
    front = [(0.0, 0.76), (-0.03, 0.6), (-0.06, 0.415)]

    for side in (-1, 1):
        E.coons(k, top, bottom, front, rear, lambda u, v, z, y, side=side: side * flank_x(z, y), "paint", nu=28, nv=20, thick=0.01, sharp=20)
        # The bronze line along the flank, a dark scoop low at its front,
        # black along the bottom edge
        E.band(k, [(-0.12, 0.62), (-0.4, 0.665), (-0.7, 0.74), (-0.98, 0.83)], [(-0.12, 0.605), (-0.4, 0.65), (-0.7, 0.726), (-0.98, 0.82)], flank_x, side,
               "bronze", nu=12)
        E.band(k, [(-0.08, 0.56), (-0.2, 0.575), (-0.36, 0.6)], [(-0.1, 0.47), (-0.2, 0.495), (-0.36, 0.56)], flank_x, side, "vent", nu=6)
        E.band(k, [(-0.06, 0.45), (-0.16, 0.465), (-0.32, 0.535), (-0.55, 0.645), (-0.8, 0.735), (-1.07, 0.825)],
               [(-0.06, 0.415), (-0.16, 0.43), (-0.32, 0.5), (-0.55, 0.61), (-0.8, 0.7), (-1.07, 0.795)], flank_x, side, "trim", nu=16, lift=0.009)
    # The top under the seat and the inner tub, closing the flanks
    k.loft([(0.0, 0.7, 0.77, 0.2), (-0.2, 0.71, 0.78, 0.24, 3, 3), (-0.45, 0.74, 0.81, 0.235, 3, 3), (-0.7, 0.79, 0.86, 0.19, 3, 3), (-0.95, 0.84, 0.91, 0.11, 3, 3),
            (-1.08, 0.85, 0.915, 0.03)], "paint", ring=16, steps=2)
    k.loft([(-0.1, 0.46, 0.7, 0.15, 3, 3), (-0.3, 0.53, 0.74, 0.17, 3, 3), (-0.55, 0.63, 0.78, 0.16, 3, 3), (-0.8, 0.7, 0.81, 0.12, 3, 3), (-1.0, 0.76, 0.82, 0.05)],
           "trim", ring=14, steps=2)
    # Tail: the light's black surround, a plate hanger with a blank plate
    # and the rear indicators, the hugger over the tyre
    k.beam((0, 0.8, -0.98), (0, 0.56, -1.08), (0.06, 0.02), "trim")
    E.plate(k, (0, 0.51, -1.095), size=(0.2, 0.14), lean=0.2)
    for side in (-1, 1):
        E.indicator(k, (side * 0.03, 0.66, -1.04), (side * 0.13, 0.665, -1.05), radius=0.01)
    k.guard((REAR[1], REAR[2]), REAR_R + 0.03, 0.17, math.radians(50), math.radians(118), "trim", crown=0.03, nu=8)

    # The long seat: the rider's part low and broad, a backrest standing at
    # its back, the pillion part stepped up, a grab rail along each side
    k.loft([(0.02, 0.765, 0.79, 0.12), (-0.04, 0.765, 0.805, 0.18, 3, 3), (-0.22, 0.775, 0.8, 0.2, 3, 3), (-0.36, 0.785, 0.815, 0.19, 3, 3), (-0.41, 0.795, 0.83, 0.15)],
           "seat", ring=16, steps=2)
    k.loft([(0.8, -0.47, -0.4, 0.06), (0.83, -0.48, -0.39, 0.13, 3, 3), (0.91, -0.5, -0.41, 0.12, 3, 3), (0.95, -0.51, -0.44, 0.08)], "seat", axis="y", ring=12, steps=2)
    k.loft([(-0.45, 0.84, 0.865, 0.12), (-0.51, 0.845, 0.89, 0.19, 3, 3), (-0.78, 0.87, 0.92, 0.16, 3, 3), (-0.95, 0.9, 0.93, 0.09)], "pillion", ring=16, steps=2)
    for side in (-1, 1):
        k.tube([(side * 0.215, 0.83, -0.5), (side * 0.225, 0.88, -0.7), (side * 0.17, 0.925, -0.93), (side * 0.1, 0.93, -0.99)], 0.014, "dark_metal", seg=7, smooth=2)


def drivetrain(k):
    k.begin("body")
    # The parallel twin in the frame, its cylinders laid forward under the
    # tunnel; only the crankcase and the transmission show below the body
    k.loft([(0.08, 0.17, 0.4, 0.13, 3, 3), (0.0, 0.15, 0.42, 0.16, 3, 3), (-0.2, 0.16, 0.42, 0.17, 3, 3), (-0.3, 0.2, 0.4, 0.14)], "casing", ring=14, steps=2)
    # Cast aluminium swingarm: the left arm the belt case, the right arm
    # slim, carrying the silencer's hanger
    left = -0.13
    k.loft([(PIVOT[1] + 0.03, 0.27, 0.42, 0.035, 3, 3, 0.5, 1, 1, left), (PIVOT[1] - 0.1, 0.24, 0.43, 0.04, 3, 3, 0.5, 1, 1, left),
            (REAR[2] + 0.15, 0.22, 0.36, 0.035, 3, 3, 0.5, 1, 1, left), (REAR[2] - 0.03, 0.24, 0.34, 0.03, 3, 3, 0.5, 1, 1, left)], "alu", ring=14, steps=2)
    # The belt cover over the left arm, black, with its pulleys' bulges
    k.loft([(PIVOT[1] - 0.02, 0.29, 0.46, 0.02, 3, 3, 0.5, 1, 1, left - 0.045), (PIVOT[1] - 0.12, 0.27, 0.46, 0.022, 3, 3, 0.5, 1, 1, left - 0.05),
            (REAR[2] + 0.12, 0.26, 0.41, 0.02, 3, 3, 0.5, 1, 1, left - 0.05), (REAR[2] + 0.04, 0.28, 0.38, 0.015, 3, 3, 0.5, 1, 1, left - 0.045)], "dark_metal", ring=12, steps=2)
    k.lathe([(0, 0), (0.12, 0), (0.12, 0.015), (0.09, 0.03), (0, 0.032)], (left - 0.06, REAR[1], REAR[2]), "dark_metal", axis="x", rot=(0, 0, math.pi), seg=20)
    k.rod((0.13, REAR[1] + 0.05, -0.38), (0.13, REAR[1] - 0.01, REAR[2] + 0.02), 0.022, "alu", seg=8)
    k.rod((0.13, PIVOT[0], PIVOT[1]), (0.13, REAR[1] + 0.05, -0.38), 0.03, "alu", seg=8)
    k.box((0.04, 0.06, 0.08), (0.13, REAR[1], REAR[2]), "alu", bevel=0.01)
    k.rod((-0.17, PIVOT[0], PIVOT[1]), (0.17, PIVOT[0], PIVOT[1]), 0.025, "dark_metal", seg=10)
    k.rod((-0.15, REAR[1], REAR[2]), (0.15, REAR[1], REAR[2]), 0.014, "steel", seg=8)
    # Rear caliper on the right, high behind the axle, on a bracket from the arm
    E.caliper(k, (RDISC_X, REAR[1], REAR[2]), RDISC_R, math.radians(158), size=(0.045, 0.05, 0.09))
    k.beam((0.115, REAR[1] + 0.01, REAR[2] - 0.02), (0.11, REAR[1] + 0.06, REAR[2] - 0.11), (0.012, 0.035), "alu")
    # Rear shock laid along under the engine, its link to the swingarm
    parts.shock(k, (0.0, 0.2, -0.1), (0.0, 0.22, -0.32), 0.03)
    # Exhaust: the header under the engine, up the right side to a fat
    # black silencer with a steel end cap, angled up toward the tail
    k.tube([(0.05, 0.2, 0.15), (0.08, 0.15, 0.0), (0.12, 0.17, -0.25), (0.2, 0.28, -0.42)], 0.024, "steel_dark", seg=8, smooth=2)

    def can(u, up, side):
        return "steel" if u > 0.88 else "dark_metal"

    k.loft([(-0.4, 0.26, 0.33, 0.035, 3, 3, 0.5, 1, 1, 0.21), (-0.47, 0.27, 0.43, 0.075, 3.4, 3.4, 0.5, 0.85, 1, 0.225),
            (-0.82, 0.39, 0.56, 0.08, 3.4, 3.4, 0.5, 0.85, 1, 0.235), (-0.87, 0.42, 0.55, 0.06, 3, 3, 0.5, 1, 1, 0.235)], can, ring=16, steps=2)
    k.cylinder(0.026, 0.02, (0.235, 0.485, -0.875), "steel_dark", axis="z", seg=10)
    # Centre stand folded under, the side stand on the left
    for side in (-1, 1):
        k.rod((side * 0.11, 0.2, -0.12), (side * 0.15, 0.13, -0.36), 0.012, "steel_dark", seg=6)
    k.rod((-0.2, 0.22, 0.0), (-0.23, 0.14, -0.27), 0.011, "steel_dark", seg=6)


def draw(k):
    wheels(k)
    front_end(k)
    bodywork(k)
    drivetrain(k)


def build():
    k = E.EKit(seed=114, colours=COLOURS, extra=EXTRA)
    k.colours["paint"] = (COLOURS["paint"], 0.3, 0.55)
    for lod in E.LODS:
        k.level(lod)
        draw(k)
    k.finish_lods(OUT, {"grip": GRIP, "peg": PEG, "seat": SEAT})
    E.previews(k, "bike14_tmax", height=0.68, reach=1.0)


build()
