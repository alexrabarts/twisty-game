# Bike 02: a 2018 1050 inline-triple streetfighter in its top trim, on the
# 2018, 2019 and 2022 trips. Matt black with red pinstripes: twin round
# "bug-eye" headlights under a small fly screen, a grey aluminium twin-spar
# frame of paired tubes, gold-stanchioned upside-down forks with grey
# radial monobloc calipers on twin 320 mm discs, a carbon front mudguard and
# carbon radiator side panels with a red stripe, black five split-spoke
# wheels with red rim pinstripes, a single-sided swingarm on the left with
# the whole right face of the rear wheel bare, a gold rear shock, and
# aftermarket twin high silencers in brushed titanium with carbon caps, one
# under each side of the tail.
#
# Real dimensions: wheelbase 1445 mm, seat 825 mm, rake 22.9 degrees,
# 120/70-17 and 190/55-17 tyres, 320 mm front and 255 mm rear discs.
#   blender --background --factory-startup --python tools/blender/bikes/bike02_speed_triple.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_a as A  # noqa: E402
from _kit_a import Vector  # noqa: E402

FRONT, REAR = (0, 0.300, 0.7225), (0, 0.320, -0.7225)
RAKE = math.radians(22.9)
FORK_LEN = 0.72
TOP = (FRONT[1] + math.cos(RAKE) * FORK_LEN, FRONT[2] - math.sin(RAKE) * FORK_LEN)
GRIP = (0.32, 1.02, 0.4)
PEG = (0.205, 0.38, -0.17)
SEAT = (0, 0.825, -0.19)
PIVOT = (0.44, -0.2)
RED = 0xC8141E
MATT = 0x16171A


def build(k):
    L1 = k.lod == 1

    # --- Wheels: black five split-spoke rims with a red pinstripe each side
    for node, c, radius, width in (("wheel_rear", REAR, 0.32, 0.19), ("wheel_front", FRONT, 0.300, 0.12)):
        k.begin(node, c)
        A.tyre(k, c, radius, width, 0.216)
        A.rim_barrel(k, c, width, 0.216)
        A.rim_stripe(k, c, width, 0.216, "accent", band=0.005)
        A.spokes(k, c, 0.216, 0.055, count=5, style="y", width=0.022, spread=0.24, twist=0.3)
        A.hub(k, c, width, radius=0.055)
    # The bare right face of the rear wheel: a big hub nut, a ring round it
    k.begin("wheel_rear")
    k.lathe([(0, 0.095), (0.04, 0.095), (0.04, 0.12), (0.026, 0.13), (0, 0.13)], REAR, "dark_metal", axis="x", seg=k.q(6, 6), sharp=20)
    k.lathe([(0, 0.13), (0.016, 0.13), (0.016, 0.138), (0, 0.138)], REAR, "steel", axis="x", seg=k.q(14, 8))
    # Sprocket on the eccentric hub, outboard of the arm on the left
    k.lathe([(0, -0.004), (0.1, -0.004), (0.1, 0.004), (0, 0.004)], (-0.15, REAR[1], REAR[2]), "steel_dark", axis="x", seg=k.q(44, 14),
            ripple=(lambda i, j: 0.006 if (j in (1, 2) and i % 2) else 0.0) if not L1 else None, sharp=20)
    k.lathe([(0, -0.15), (0.06, -0.15), (0.06, -0.095), (0, -0.095)], REAR, "dark_metal", axis="x", seg=k.q(18, 8))

    k.begin("disc_rear", REAR)
    A.disc(k, (-0.072, REAR[1], REAR[2]), 0.1275, style="round", carrier="dark_metal", arms=6)
    k.begin("disc_front", FRONT)
    for side in (-1, 1):
        A.disc(k, (side * 0.07, FRONT[1], FRONT[2]), 0.159, style="round", carrier="dark_metal", arms=6)

    # --- Forks: upside-down, black outer tubes, gold stanchions, radial calipers
    A.fork_pair(k, x=0.105, axle=(FRONT[1], FRONT[2]), top=TOP, pivot=(0.105, 0.65, 0.58), usd=True, r_tube=0.0215,
                outer_mat="anodised", inner_mat="fork_gold", foot_mat="dark_metal", cap_mat="anodised", adjust_mat="fork_gold",
                calipers=(-1, 1), disc_x=0.07, disc_r=0.159, caliper_mat="caliper", caliper_angle=158, caliper_size=1.05, split=0.36)

    # --- Handlebar: a flat black taper bar, bar-end mirrors on short stalks
    k.begin("handlebar", (0, 1.0, 0.42))
    clamp = Vector((0, 0.995, 0.43))
    for side in (-1, 1):
        g = Vector((side * GRIP[0], GRIP[1], GRIP[2]))
        bend = Vector((side * 0.14, 1.005, 0.42))
        k.tube([clamp, clamp + Vector((side * 0.06, 0, 0)), bend, g - Vector((side * 0.08, 0, -0.004)), g + Vector((side * 0.07, 0, 0))],
               [0.0145, 0.0145, 0.013, 0.0115, 0.0115], "dark_metal", seg=k.q(10, 6), smooth=2)
        A.bar_controls(k, g, bend, side, lever_mat="dark_metal", housing="dark_metal")
        k.cylinder(0.02, 0.04, (side * 0.05, 0.975, 0.435), "dark_metal", seg=k.q(10, 6))
        # Bar-end mirror: a stalk out and up from the bar end, a wide oval head
        end = g + Vector((side * 0.08, 0, 0))
        knee = end + Vector((side * 0.035, 0.01, -0.01))
        head = end + Vector((side * 0.07, 0.17, -0.03))
        k.tube([end, knee, knee + Vector((side * 0.01, 0.08, 0)), head - Vector((side * 0.005, 0.02, 0))], 0.008, "dark_metal", seg=k.q(6, 4), smooth=2)
        k.loft([(head.z - 0.012, head.y - 0.03, head.y + 0.03, 0.04, 2.2, 2.2, 0.5, 1, 1, head.x + side * 0.03),
                (head.z - 0.004, head.y - 0.045, head.y + 0.045, 0.075, 2.4, 2.4, 0.5, 1, 1, head.x + side * 0.045),
                (head.z + 0.012, head.y - 0.044, head.y + 0.044, 0.074, 2.4, 2.4, 0.5, 1, 1, head.x + side * 0.045),
                (head.z + 0.02, head.y - 0.025, head.y + 0.025, 0.04, 2.2, 2.2, 0.5, 1, 1, head.x + side * 0.03)],
               "dark_metal", ring=k.q(14, 6), steps=1, sharp=40)

    # --- Brake light: an LED unit under the tail's tip
    k.begin("brake_light", (0, 0.93, -0.9))
    k.loft([(-0.875, 0.915, 0.95, 0.055, 2.6, 2.6), (-0.9, 0.915, 0.948, 0.05, 2.6, 2.6), (-0.91, 0.92, 0.94, 0.035)], "brake", ring=k.q(12, 6), steps=1)

    # --- Headlights: two round bug-eyes on a bracket, turned a little apart:
    # a deep black shell, a chrome reflector, the lamp in its middle
    k.begin("headlight", (0, 0.905, 0.635))
    for side in (-1, 1):
        cx, cy, cz = side * 0.079, 0.905, 0.635
        toe = side * 0.18
        d = Vector((math.sin(toe), 0, math.cos(toe)))
        c = Vector((cx, cy, cz))
        k.lathe([(0, 0.0), (0.046, 0.0), (0.064, 0.035), (0.07, 0.095), (0.067, 0.125), (0.0, 0.126)], tuple(c - d * 0.12), "dark_metal", to=tuple(c + d), seg=k.q(24, 10))
        k.lathe([(0.064, 0.0), (0.06, 0.004), (0.024, -0.01), (0.0, -0.012)], tuple(c + d * 0.004), "steel", to=tuple(c + d), seg=k.q(24, 10))
        k.lathe([(0, 0.0), (0.022, 0.0), (0.019, 0.006), (0, 0.009)], tuple(c - d * 0.006), "headlight", to=tuple(c + d), seg=k.q(18, 8))

    k.begin("body")
    body(k)


def body(k):
    L1 = k.lod == 1

    stem, axis, back = A.yokes(k, 0.105, (FRONT[1], FRONT[2]), TOP, 0.0305, offset=0.03, mat="dark_metal", lower_t=0.78)
    head_a = Vector((0, FRONT[1], FRONT[2])) + Vector((0, axis.y, axis.z)) * FORK_LEN * 0.76 + back * 0.03
    head_b = Vector((0, FRONT[1], FRONT[2])) + Vector((0, axis.y, axis.z)) * FORK_LEN * 0.98 + back * 0.03
    k.rod(tuple(head_a), tuple(head_b), 0.036, "frame", seg=k.q(14, 8))
    # Headlight bracket, instruments, the fly screen with its red line
    k.box((0.2, 0.03, 0.05), (0, 0.875, 0.555), "dark_metal", rot=(-0.2, 0, 0), bevel=0.008)
    k.box((0.13, 0.09, 0.035), (0, 0.98, 0.56), "dark_metal", rot=(0.8, 0, 0), bevel=0.008)
    k.box((0.11, 0.07, 0.005), (0, 0.992, 0.546), "dash", rot=(0.8, 0, 0), bevel=0)

    def flyscreen(u, up, side):
        return "paint"

    k.loft([(0.53, 0.975, 1.02, 0.07, 2.6, 2.6), (0.59, 0.96, 1.025, 0.13, 3, 2.6, 0.5, 0.85, 1), (0.65, 0.945, 1.0, 0.14, 3, 2.6, 0.5, 0.85, 1),
            (0.69, 0.94, 0.975, 0.11, 3, 2.6), (0.705, 0.945, 0.96, 0.06)], flyscreen, ring=k.q(18, 10), steps=k.q(2, 1))
    if not L1:
        # Red pinstripe across the screen's right half
        # Red pinstripe up the screen's left half
        k.box((0.008, 0.004, 0.12), (-0.05, 1.008, 0.62), "accent", rot=(-0.3, 0.25, 0.0), bevel=0)
    # Front indicators beside the lights
    for side in (-1, 1):
        k.rod((side * 0.12, 0.84, 0.6), (side * 0.155, 0.84, 0.635), 0.006, "dark_metal", seg=6)
        k.loft([(0.625, 0.833, 0.847, 0.008, 2.4, 2.4, 0.5, 1, 1, side * 0.165), (0.65, 0.83, 0.85, 0.011, 2.4, 2.4, 0.5, 1, 1, side * 0.168),
                (0.665, 0.836, 0.844, 0.006, 2.4, 2.4, 0.5, 1, 1, side * 0.17)], "signal", ring=k.q(10, 6), steps=1)

    # Tank: faceted. A high, near-flat crown narrowed by chamfers into hard
    # creases that run down and back to the knee recesses
    k.loft([(0.47, 0.9, 0.99, 0.08, 5, 3),
            (0.43, 0.82, 1.06, 0.17, 5, 3.4, 0.62, 0.52, 0.9),
            (0.33, 0.78, 1.09, 0.205, 5.5, 3.4, 0.62, 0.48, 0.85),
            (0.19, 0.77, 1.077, 0.2, 5.5, 3.4, 0.62, 0.48, 0.82),
            (0.07, 0.78, 1.01, 0.16, 5, 3, 0.6, 0.52, 0.8),
            (-0.02, 0.79, 0.945, 0.12, 4.5, 2.8, 0.55, 0.6, 1),
            (-0.05, 0.81, 0.9, 0.07)],
           "paint", ring=k.q(16, 10), steps=k.q(2, 1), sharp=16)
    # A crease-line facet low on each flank, angled forward over the frame
    for side in (-1, 1):
        k.panel([(0.44, 0.93), (0.4, 0.96), (0.22, 0.92), (0.12, 0.85), (0.24, 0.83), (0.38, 0.86)], side * 0.19, 0.01, "paint", toe=-side * 0.12, bevel=0.003)
    k.cylinder(0.045, 0.012, (0, 1.083, 0.24), "dark_metal", seg=k.q(16, 8))
    if not L1:
        k.cylinder(0.03, 0.006, (0, 1.091, 0.24), "steel_dark", seg=12)
    # Black knee panels let into the tank's flanks, a red line at the front of each
    for side in (-1, 1):
        k.panel([(0.34, 0.86), (0.2, 0.91), (0.05, 0.89), (0.02, 0.82), (0.12, 0.79), (0.28, 0.79)], side * 0.176, 0.008, "paint_dark", toe=side * 0.08, bevel=0.003)
        k.panel([(0.42, 0.9), (0.41, 0.885), (0.3, 0.84), (0.3, 0.852)], side * 0.168, 0.004, "accent", toe=-side * 0.2, bevel=0)

    # Radiator, its carbon side panels with a red stripe, the airbox intakes
    rad = A.Matrix.Translation(Vector((0, 0.6, 0.45))) @ A.euler(-0.18, 0, 0)
    k.fbox(rad, (0.34, 0.34, 0.045), (0, 0, 0), "dark_metal", bevel=0.006)
    k.fbox(rad, (0.31, 0.31, 0.004), (0, 0, 0.024), "vent", bevel=0)
    if not L1:
        for n in range(10):
            k.fbox(rad, (0.31, 0.004, 0.008), (0, -0.14 + n * 0.031, 0.029), "dark_metal", bevel=0)
    for side in (-1, 1):
        k.panel([(0.6, 0.79), (0.6, 0.72), (0.5, 0.6), (0.36, 0.58), (0.28, 0.66), (0.3, 0.76), (0.44, 0.8)], side * 0.19, 0.018, "carbon", toe=-side * 0.12, bevel=0.006)
        k.panel([(0.6, 0.79), (0.59, 0.775), (0.33, 0.745), (0.31, 0.762)], side * 0.2, 0.004, "accent", toe=-side * 0.12, bevel=0)
        k.panel([(0.585, 0.765), (0.58, 0.755), (0.45, 0.738), (0.44, 0.746)], side * 0.2, 0.004, "plastic", toe=-side * 0.12, bevel=0)

    # Seat with its step, and the pillion seat on the tail
    k.loft([(0.0, 0.8, 0.84, 0.1, 3, 3), (-0.06, 0.8, 0.835, 0.15, 3, 3), (-0.22, 0.8, 0.83, 0.15, 3.2, 3), (-0.34, 0.81, 0.85, 0.12, 3, 3),
            (-0.4, 0.83, 0.88, 0.08)], "seat", ring=k.q(16, 8), steps=k.q(2, 1))
    k.loft([(-0.42, 0.88, 0.92, 0.06, 3, 3), (-0.46, 0.88, 0.94, 0.1, 3, 3), (-0.62, 0.91, 0.96, 0.08, 3, 3), (-0.7, 0.93, 0.965, 0.05)],
           "seat", ring=k.q(14, 8), steps=k.q(2, 1))

    # Tail: slim and upswept, ending over the light
    k.loft([(-0.04, 0.7, 0.82, 0.13, 3, 2.6),
            (-0.2, 0.73, 0.84, 0.15, 3, 2.6),
            (-0.4, 0.78, 0.89, 0.13, 3, 2.6),
            (-0.6, 0.84, 0.94, 0.1, 3, 2.6),
            (-0.78, 0.89, 0.96, 0.075, 3, 2.6),
            (-0.88, 0.91, 0.96, 0.05)],
           "paint", ring=k.q(18, 10), steps=k.q(3, 1), sharp=35)
    k.loft([(-0.3, 0.72, 0.78, 0.1), (-0.6, 0.8, 0.86, 0.08), (-0.84, 0.86, 0.9, 0.05)], "paint_dark", ring=k.q(10, 6), steps=1)

    # Plate hanger: a long black arm down and back, the plate, indicators, reflector
    k.loft([(-0.82, 0.86, 0.9, 0.035), (-0.95, 0.76, 0.8, 0.03), (-1.06, 0.63, 0.67, 0.03)], "dark_metal", ring=k.q(10, 6), steps=k.q(2, 1))
    k.box((0.2, 0.15, 0.006), (0, 0.56, -1.09), "plate", rot=(0.22, 0, 0), bevel=0)
    k.box((0.21, 0.16, 0.008), (0, 0.56, -1.085), "dark_metal", rot=(0.22, 0, 0), bevel=0.003)
    k.box((0.07, 0.025, 0.006), (0, 0.66, -1.06), "reflector", rot=(0.22, 0, 0), bevel=0.002)
    for side in (-1, 1):
        k.rod((side * 0.02, 0.74, -0.98), (side * 0.12, 0.745, -0.985), 0.0065, "dark_metal", seg=6)
        k.loft([(-0.97, 0.735, 0.755, 0.01, 2.4, 2.4, 0.5, 1, 1, side * 0.13), (-0.995, 0.732, 0.758, 0.013, 2.4, 2.4, 0.5, 1, 1, side * 0.135),
                (-1.01, 0.738, 0.752, 0.008, 2.4, 2.4, 0.5, 1, 1, side * 0.137)], "signal", ring=k.q(10, 6), steps=1)

    # Carbon front mudguard hugging the tyre
    k.guard((FRONT[1], FRONT[2]), 0.322, 0.125, math.radians(25), math.radians(140), "carbon", crown=0.035, nu=k.q(10, 5), nv=k.q(5, 3))
    for side in (-1, 1):
        # Side flanks, inboard of the discs
        k.panel([(0.66, 0.42), (0.78, 0.5), (0.86, 0.46), (0.8, 0.36), (0.7, 0.33)], side * 0.052, 0.006, "carbon", bevel=0.002)

    frame(k)
    engine(k)
    exhaust(k)
    rear_end(k)


def frame(k):
    # Twin spars of paired tubes from the headstock over the engine to the
    # pivot castings, all in satin grey; a lighter tubular subframe
    for side in (-1, 1):
        S = lambda p: (side * p[0], p[1], p[2])
        upper = [(0.05, 0.93, 0.42), (0.13, 0.86, 0.3), (0.16, 0.76, 0.08), (0.16, 0.67, -0.1), (0.15, 0.6, -0.16)]
        lower = [(0.05, 0.84, 0.46), (0.13, 0.74, 0.36), (0.165, 0.64, 0.18), (0.165, 0.57, -0.02), (0.15, 0.52, -0.13)]
        k.tube([S(p) for p in upper], 0.031, "frame", seg=k.q(12, 6), smooth=k.q(3, 2))
        k.tube([S(p) for p in lower], 0.028, "frame", seg=k.q(12, 6), smooth=k.q(3, 2))
        # Web between the two tubes near the head, and the pivot casting
        k.panel([(0.36, 0.84), (0.42, 0.88), (0.42, 0.78), (0.36, 0.74)], side * 0.12, 0.03, "frame", toe=-side * 0.35, bevel=0.006)
        k.panel([(-0.02, 0.68), (-0.14, 0.68), (-0.26, 0.56), (-0.27, 0.36), (-0.2, 0.3), (-0.1, 0.34), (-0.04, 0.46)], side * 0.155, 0.035, "frame", bevel=0.01)
        k.cylinder(0.03, 0.012, (side * 0.177, PIVOT[0], PIVOT[1]), "steel", axis="x", seg=k.q(14, 8))
        # Subframe: two tubes up to the tail, braced
        k.tube([(side * 0.15, 0.64, -0.16), (side * 0.12, 0.82, -0.4), (side * 0.07, 0.9, -0.78)], 0.012, "frame_light", seg=k.q(8, 5), smooth=1)
        k.tube([(side * 0.15, 0.48, -0.24), (side * 0.13, 0.62, -0.42), (side * 0.11, 0.8, -0.5)], 0.011, "frame_light", seg=k.q(8, 5), smooth=1)
        k.rod((side * 0.12, 0.82, -0.4), (side * 0.13, 0.62, -0.42), 0.009, "frame_light", seg=k.q(6, 4))
    k.rod((-0.15, 0.62, -0.13), (0.15, 0.62, -0.13), 0.02, "frame", seg=k.q(10, 6))


def engine(k):
    L1 = k.lod == 1
    seg = k.q(24, 10)
    # Crankcase of the triple: wide, deep at the back over the gearbox
    k.loft([(0.33, 0.22, 0.5, 0.17, 3, 3), (0.28, 0.16, 0.52, 0.19, 3.2, 3.2), (0.04, 0.15, 0.54, 0.2, 3.2, 3.2), (-0.1, 0.19, 0.56, 0.18, 3, 3),
            (-0.16, 0.3, 0.56, 0.15, 3, 3), (-0.18, 0.4, 0.52, 0.09)], "dark_metal", ring=k.q(18, 10), steps=k.q(2, 1), sharp=35)
    cyl = A.Matrix.Translation(Vector((0, 0.56, 0.24))) @ A.euler(-0.22, 0, 0)
    k.fbox(cyl, (0.34, 0.16, 0.17), (0, 0, 0), "dark_metal", bevel=0.012)
    k.fbox(cyl, (0.35, 0.07, 0.19), (0, 0.11, 0.0), "dark_metal", bevel=0.014)
    k.fbox(cyl, (0.32, 0.055, 0.17), (0, 0.17, 0.0), "dark_metal", bevel=0.02)
    if not L1:
        for x in (-0.1, 0.0, 0.1):
            k.cylinder(0.014, 0.01, tuple(cyl @ Vector((x, 0.2, -0.02))), "steel_dark", seg=10)
        for n in range(3):
            k.fbox(cyl, (0.352, 0.006, 0.172), (0, -0.05 + n * 0.035, 0), "steel_dark", bevel=0)
    # Right side: the big round clutch cover and the pump cover ahead of it
    k.lathe([(0, 0), (0.1, 0), (0.104, 0.014), (0.092, 0.034), (0.06, 0.044), (0, 0.046)], (0.2, 0.37, 0.07), "dark_metal", axis="x", seg=seg)
    k.lathe([(0, 0), (0.06, 0), (0.062, 0.012), (0.05, 0.028), (0, 0.03)], (0.2, 0.36, 0.26), "dark_metal", axis="x", seg=seg)
    if not L1:
        k.lathe([(0, 0), (0.04, 0), (0.04, 0.006), (0, 0.006)], (0.245, 0.37, 0.07), "steel_dark", axis="x", seg=16)
        k.lathe([(0, 0), (0.035, 0), (0.035, 0.006), (0, 0.006)], (0.23, 0.36, 0.26), "steel_dark", axis="x", seg=16)
        k.box((0.02, 0.1, 0.06), (0.21, 0.5, 0.12), "steel_dark", bevel=0.006)
    # Left side: alternator cover, the sprocket cover
    k.lathe([(0, 0), (0.085, 0), (0.088, 0.014), (0.07, 0.032), (0, 0.036)], (-0.2, 0.38, 0.2), "dark_metal", axis="x", rot=(0, 0, math.pi), seg=seg)
    k.box((0.04, 0.12, 0.14), (-0.19, 0.39, -0.08), "dark_metal", bevel=0.014)
    A.bolts(k, (0.24, 0.37, 0.07), 0.092, 12, 1, mat="steel_dark")
    A.bolts(k, (0.225, 0.36, 0.26), 0.052, 6, 1, mat="steel_dark")
    A.bolts(k, (-0.235, 0.38, 0.2), 0.076, 9, -1, mat="steel_dark")
    A.cable(k, [(0.05, 0.99, 0.38), (0.08, 0.93, 0.47), (0.07, 0.82, 0.48), (0.1, 0.74, 0.34)])
    A.cable(k, [(-0.09, 0.99, 0.38), (-0.1, 0.92, 0.47), (-0.08, 0.8, 0.46), (-0.13, 0.62, 0.28)])
    # Sump, oil filter
    k.box((0.26, 0.06, 0.3), (0, 0.16, 0.1), "dark_metal", bevel=0.015)
    k.cylinder(0.038, 0.07, (0.06, 0.24, 0.32), "dark_metal", rot=(-1.1, 0, 0), seg=k.q(14, 8))
    # Throttle bodies and airbox behind the head, under the tank
    k.box((0.3, 0.14, 0.2), (0, 0.76, 0.12), "dark_metal", bevel=0.02)


def exhaust(k):
    L1 = k.lod == 1
    # Three headers down the front of the engine, under it into the collector
    for x in (-0.08, 0.0, 0.08):
        k.tube([(x, 0.6, 0.42), (x * 1.05, 0.52, 0.48), (x * 1.0, 0.36, 0.47), (x * 0.8, 0.22, 0.4), (x * 0.5, 0.15, 0.26), (x * 0.3, 0.14, 0.12)],
               0.02, "steel_dark", seg=k.q(10, 6), smooth=k.q(3, 2))
    # Black belly pan under the front, the silver collector box behind it
    k.loft([(0.36, 0.15, 0.24, 0.08), (0.3, 0.12, 0.26, 0.15, 3, 3), (0.08, 0.11, 0.25, 0.17, 3, 3), (-0.02, 0.13, 0.23, 0.12)],
           "paint_dark", ring=k.q(14, 8), steps=k.q(2, 1))
    k.loft([(0.18, 0.1, 0.2, 0.08), (0.1, 0.085, 0.215, 0.12, 3.4, 3.4), (-0.16, 0.09, 0.22, 0.13, 3.4, 3.4), (-0.24, 0.11, 0.22, 0.1)],
           "titanium", ring=k.q(16, 8), steps=k.q(2, 1))
    # Link pipes up behind the engine to the two cans under the tail
    for side in (-1, 1):
        k.tube([(side * 0.04, 0.16, -0.2), (side * 0.09, 0.26, -0.27), (side * 0.13, 0.44, -0.28), (side * 0.15, 0.55, -0.3)], 0.021, "steel_dark",
               seg=k.q(10, 6), smooth=k.q(3, 2))
        a, b = (side * 0.16, 0.57, -0.3), (side * 0.172, 0.86, -0.91)
        length = (Vector(b) - Vector(a)).length
        # A tapered, flat-sided can: titanium body, carbon end cap and inlet sleeve
        k.lathe([(0.0, 0.0), (0.03, 0.0), (0.06, 0.08), (0.067, length * 0.45), (0.064, length * 0.92), (0.056, length * 0.965)],
                a, "titanium", to=b, seg=k.q(12, 6), sharp=40)
        k.lathe([(0.058, length * 0.955), (0.059, length), (0.034, length), (0.032, length * 0.98), (0.0, length * 0.98)], a, "carbon", to=b, seg=k.q(16, 8))
        k.lathe([(0.0, -0.02), (0.024, -0.02), (0.034, 0.07), (0.0, 0.07)], a, "carbon", to=b, seg=k.q(10, 6))
        if not L1:
            k.lathe([(0.069, length * 0.6), (0.069, length * 0.64)], a, "carbon", to=b, seg=12, solid=0.003)
            # Hanger strap from the subframe
            k.rod((side * 0.11, 0.82, -0.62), (side * 0.15, 0.78, -0.66), 0.008, "frame_light", seg=6)


def rear_end(k):
    L1 = k.lod == 1
    # Single-sided swingarm on the left: a deep cast arm to the eccentric
    # hub housing, its root wrapping round the pivot on both sides
    xa = -0.12
    k.loft([(PIVOT[1] + 0.03, PIVOT[0] - 0.07, PIVOT[0] + 0.07, 0.03, 3, 3, 0.5, 1, 1, xa),
            (PIVOT[1] - 0.12, PIVOT[0] - 0.085, PIVOT[0] + 0.065, 0.03, 3, 3, 0.5, 1, 1, xa),
            (PIVOT[1] - 0.3, REAR[1] - 0.07, REAR[1] + 0.09, 0.028, 3, 3, 0.5, 1, 1, xa + 0.004),
            (REAR[2] + 0.1, REAR[1] - 0.055, REAR[1] + 0.065, 0.026, 3, 3, 0.5, 1, 1, xa + 0.004),
            (REAR[2] + 0.04, REAR[1] - 0.06, REAR[1] + 0.06, 0.026, 3, 3, 0.5, 1, 1, xa + 0.004)],
           "dark_metal", ring=k.q(16, 8), steps=k.q(3, 1), sharp=35)
    k.lathe([(0, -0.03), (0.085, -0.03), (0.09, -0.02), (0.09, 0.02), (0.085, 0.03), (0, 0.03)], (xa, REAR[1], REAR[2]), "dark_metal", axis="x", seg=k.q(24, 10))
    k.box((0.24, 0.12, 0.1), (-0.0, PIVOT[0], PIVOT[1] - 0.04), "dark_metal", bevel=0.02)
    k.rod((-0.2, PIVOT[0], PIVOT[1]), (0.2, PIVOT[0], PIVOT[1]), 0.018, "steel_dark", seg=k.q(10, 6))
    if not L1:
        # Lightening pockets in the arm
        for z0, z1 in ((PIVOT[1] - 0.06, PIVOT[1] - 0.2), (PIVOT[1] - 0.25, REAR[2] + 0.16)):
            k.panel([(z0, PIVOT[0] - 0.02 + (z0 - PIVOT[1]) * 0.18), (z1, PIVOT[0] - 0.02 + (z1 - PIVOT[1]) * 0.18), (z1, PIVOT[0] - 0.06 + (z1 - PIVOT[1]) * 0.18),
                     (z0, PIVOT[0] - 0.06 + (z0 - PIVOT[1]) * 0.18)], xa - 0.03, 0.004, "vent", bevel=0)

    # Gold rear shock, nearly upright behind the engine
    a, b = (0.0, 0.72, -0.12), (0.0, 0.42, -0.24)
    length = (Vector(b) - Vector(a)).length
    coils = 8
    k.lathe([(0.033 if n % 2 else 0.025, length * (0.18 + 0.66 * n / (coils * 2))) for n in range(coils * 2 + 1)], a, "fork_gold", to=b, seg=k.q(10, 6), sharp=80)
    k.rod(a, b, 0.016, "anodised", seg=k.q(8, 5))
    k.cylinder(0.026, 0.12, tuple(Vector(a) + (Vector(b) - Vector(a)) * 0.12), "fork_gold", rot=(math.atan2(-(b[2] - a[2]), b[1] - a[1]) * 0 - 0.38, 0, 0), seg=k.q(10, 6))

    # Chain on the left, outboard of the arm; the front sprocket
    A.chain(k, -0.15, (0.44, -0.06, 0.045), (REAR[1], REAR[2], 0.1))
    # Rear caliper under the arm, gripping the disc inboard of it
    A.caliper(k, (REAR[1], REAR[2]), 0.1275, 205, -0.072, mat="caliper", lug_mat="dark_metal", lug_to=(-0.11, REAR[1] - 0.02, REAR[2] + 0.14), size=0.85)

    # Rearsets: pegs with silver heel plates, the pillion pegs on cast hangers
    for side in (-1, 1):
        x, y, z = side * PEG[0], PEG[1], PEG[2]
        k.rod((x - side * 0.07, y, z), (x + side * 0.05, y, z), 0.012, "rubber", seg=k.q(10, 6))
        k.panel([(z + 0.06, y + 0.03), (z - 0.04, y + 0.17), (z - 0.12, y + 0.14), (z - 0.06, y - 0.01), (z + 0.02, y - 0.03)], side * (PEG[0] - 0.07), 0.01, "frame_light", bevel=0.004)
        px, py, pz = side * 0.2, 0.52, -0.46
        k.rod((px - side * 0.05, py, pz), (px + side * 0.04, py, pz), 0.011, "rubber", seg=k.q(8, 5))
        k.tube([(side * 0.14, 0.66, -0.34), (side * 0.16, 0.56, -0.42), (px - side * 0.04, py, pz)], 0.012, "frame_light", seg=k.q(8, 5))
    k.rod((-PEG[0] + 0.05, PEG[1] - 0.01, PEG[2] + 0.02), (-PEG[0] + 0.02, PEG[1] + 0.02, PEG[2] + 0.18), 0.007, "steel", seg=6)
    k.rod((PEG[0] - 0.05, PEG[1] - 0.01, PEG[2] + 0.02), (PEG[0] - 0.02, PEG[1] - 0.03, PEG[2] + 0.17), 0.007, "steel", seg=6)
    k.rod((-0.16, 0.3, -0.06), (-0.28, 0.06, 0.04), 0.011, "frame_light", seg=k.q(8, 5))


def build_all(k):
    build(k)
    # Soft tail pack lying on the pillion seat, carried on every trip
    A.tail_pack(k, -0.74, -0.42, 0.93, 1.1, 0.155)
    k.begin("body")


A.build(build_all, "bike02_speed_triple", seed=102,
        colours={"bag": 0x1A1B1F, "paint": MATT, "paint_dark": 0x0B0B0D, "accent": RED, "rim": 0x111215, "caliper": 0x8E9298, "carbon": 0x1B1C20},
        anchors={"grip": GRIP, "peg": PEG, "seat": SEAT},
        views={"match_s22_140": ((3.8, 0.7, 1.1), (0, 0.6, -0.05), 52), "match_a18_186": ((0.3, 0.85, 2.5), (0, 0.65, 0.3), 36),
               "front": ((0.0, 0.95, 4.2), (0, 0.6, 0.2), 55), "rear": ((0.0, 1.1, -4.2), (0, 0.6, -0.2), 55)})
