# bike-09 of the trip photos: an 890 cc parallel-twin super-naked in black
# and white with an orange trellis frame and orange wheels (Alps 2023).
# What makes it read as that bike: the split, pointed LED face in a black
# cowl with orange inner flanks and a clear touring screen (an owner's fit),
# the white tank shrouds with a black lower edge and the orange lightning
# flash, the black tank between them, the orange steel trellis round the
# compact twin, the white front mudguard with its own flash, black forks
# with radial calipers on twin discs, the curved black swingarm, the shock
# off to the left, the sharp upswept tail with the plate on a long hanger,
# orange ten-spoke wheels, the short slip-on silencer angled up on the
# right (an owner's fit; the stock box under the engine stays) and a black
# roll bag on the pillion. No badges, no lettering, a blank plate.
#
# Real dimensions in metres (17-inch wheels, 300 mm front and 240 mm rear
# discs, 820 mm seat), with the wheel centres where every game bike has them
# (y 0.3, z +-0.7): a 1.40 m wheelbase against the real 1.482 m.
#   blender --background --factory-startup --python tools/blender/bikes/bike09_duke890.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_c as kc  # noqa: E402
from _kit_c import FRONT, REAR  # noqa: E402

NAME = "bike09_duke890"
RAKE = math.radians(24)
GRIP = (0.36, 1.07, 0.34)
PEG = (0.2, 0.4, -0.18)
SEAT = (0, 0.84, -0.14)
COLOURS = {
    "paint": 0xE9E9E6,        # white shrouds and mudguard
    "paint_dark": 0x3A3A3A,
    "accent": 0xEE5A0C,
    "rim": 0xEE5A0C,          # orange wheels
    "frame": 0xEE5A0C,        # orange trellis frame
    "fork_gold": 0x1A1B1E,    # black outer fork tubes
    "caliper": 0x1C1D20,
    "spring": 0x22242A,
    "engine": 0x26272A,
    "cover": 0x36383C,
    "bronze": 0x8A7460,
    "luggage": 0x1A1B1E,
}


def build(k):
    hi = k.hi
    # ---- wheels and discs
    k.begin("wheel_rear", REAR)
    kc.wheel(k, REAR, 0.3, 0.18, 0.215, spokes=5, spread=0.26, blade=(0.012, 0.01), curve=0.08)
    kc.sprocket(k, REAR, -0.097, 0.1)
    k.begin("wheel_front", FRONT)
    kc.wheel(k, FRONT, 0.3, 0.12, 0.215, spokes=5, spread=0.26, blade=(0.011, 0.009), curve=0.08)
    k.begin("disc_rear", (0.086, 0.3, -0.7))
    kc.disc(k, (0.086, 0.3, -0.7), 0.12)
    k.begin("disc_front", (0.066, 0.3, 0.7))
    for side in (-1, 1):
        kc.disc(k, (side * 0.066, 0.3, 0.7), 0.15)

    # ---- black forks, clamps, tapered bar with angular mirrors
    kc.usd_forks(k, x=0.1, axle=(0.3, 0.7), top=0.95, rake=RAKE, outer=0.026, inner=0.0205, outer_mat="fork_gold", inner_mat="steel_dark",
                 foot_mat="matt_black", disc_x=0.066, disc_radius=0.15, caliper_angle=205, caps="frame")
    k.begin("body")
    kc.clamps(k, 0.1, (0.3, 0.7), 0.935, 0.8, RAKE, 0.026, mat="matt_black")
    k.begin("handlebar", (0, 1.0, 0.38))
    kc.handlebar(k, GRIP, (0.985, 0.39), 0.06, mat="matt_black", mirrors=((0.22, 1.07, 0.36), (0.31, 1.22, 0.32), (0.075, 0.035)))
    k.box((0.11, 0.07, 0.03), (0, 1.0, 0.43), "matt_black", rot=(-0.55, 0, 0), bevel=k.seg(0.008, 0))
    k.box((0.09, 0.05, 0.004), (0, 1.006, 0.445), "dash", rot=(-0.55, 0, 0), bevel=0)
    if hi:
        for side in (-1, 1):
            k.tube([(side * 0.26, 1.08, 0.36), (side * 0.12, 1.0, 0.46), (side * 0.11, 0.9, 0.48)], 0.0045, "matt_black", seg=5, smooth=2)

    k.begin("body")
    # ---- orange steel trellis: rails from the head over the engine, braced
    # into triangles, the engine hung in it as a stressed member
    k.rod((0, 0.8, 0.41), (0, 0.97, 0.335), 0.03, "frame", seg=k.seg(14, 8))
    head_hi, head_lo = (0.05, 0.93, 0.35), (0.05, 0.82, 0.39)
    top, rear, low, mid, back = (0.135, 0.85, 0.12), (0.14, 0.76, -0.08), (0.125, 0.6, 0.27), (0.14, 0.6, 0.02), (0.13, 0.55, -0.12)
    for side in (-1, 1):
        h1, h2, t, r, lo, m, bk = [(side * p[0], p[1], p[2]) for p in (head_hi, head_lo, top, rear, low, mid, back)]
        for a, b in ((h1, t), (t, r), (h2, lo), (h2, t), (lo, t), (t, m), (lo, m), (m, r), (r, bk), (m, bk)):
            k.rod(a, b, 0.0125, "frame", seg=k.seg(8, 5))
        if hi:
            for p in (t, m, lo, r):
                k.cylinder(0.016, 0.012, p, "frame", axis="x", seg=8)
        # Cast black subframe up to the tail
        k.panel([(-0.06, 0.8), (-0.4, 0.86), (-0.66, 0.9), (-0.66, 0.86), (-0.4, 0.8), (-0.14, 0.62), (-0.08, 0.62)], side * 0.11, 0.02, "matt_black",
                toe=side * 0.05, bevel=k.seg(0.006, 0))
    # Engine: the compact twin, swingarm pivot in its cases
    kc.parallel_twin(k, (0.37, 0.06), case_mat="engine", cover_mat="cover", head_mat="engine", tilt=0.28)
    k.box((0.2, 0.14, 0.28), (0, 0.76, 0.06), "matt_black", rot=(0.1, 0, 0), bevel=k.seg(0.02, 0))
    kc.radiator(k, (0, 0.6, 0.37), (0.3, 0.27, 0.04), -0.2)
    for side in (-1, 1):
        kc.skin(k, [(0.47, 0.76), (0.45, 0.5), (0.38, 0.46), (0.36, 0.72)], lambda z: 0.165, 0.014, "matt_black", side, bevel=k.seg(0.004, 0))

    # ---- exhaust: two headers down in front of the engine into the box
    # under it, a link pipe out to the slip-on angled up on the right
    for xx in (-0.06, 0.06):
        k.tube([(xx, 0.6, 0.26), (xx, 0.5, 0.3), (xx * 0.8, 0.3, 0.29), (xx * 0.5, 0.16, 0.2), (xx * 0.3 + 0.02, 0.12, 0.06)], 0.02, "bronze",
               seg=k.seg(10, 6), smooth=k.seg(3, 1))
    k.loft([(0.1, 0.08, 0.2, 0.08), (0.04, 0.06, 0.21, 0.12, 3, 3, 0.5, 1, 1, 0.02), (-0.14, 0.07, 0.2, 0.12, 3, 3, 0.5, 1, 1, 0.03),
            (-0.2, 0.1, 0.19, 0.08, 3, 3, 0.5, 1, 1, 0.05)], "matt_black", ring=k.seg(16, 8), steps=k.seg(2, 1))
    k.tube([(0.1, 0.15, -0.18), (0.16, 0.22, -0.24), (0.175, 0.32, -0.3)], 0.024, "steel", seg=k.seg(10, 6), smooth=k.seg(2, 1))
    kc.parts.can(k, (0.175, 0.31, -0.29), (0.2, 0.52, -0.58), 0.05, mat="matt_black", cap="carbon")
    k.beam((0.15, 0.5, -0.5), (0.19, 0.48, -0.52), (0.02, 0.03), "steel_dark", bevel=0)

    # ---- swingarm: curved cast arms, an open window in each, chain adjusters
    for side in (-1, 1):
        k.panel([(-0.08, 0.48), (-0.3, 0.46), (-0.6, 0.36), (-0.76, 0.33), (-0.77, 0.27), (-0.6, 0.255), (-0.32, 0.3), (-0.12, 0.36)], side * 0.118, 0.035,
                "matt_black", bevel=k.seg(0.008, 0))
        if hi:
            k.panel([(-0.2, 0.43), (-0.42, 0.38), (-0.4, 0.33), (-0.22, 0.36)], side * (0.118 + 0.018), 0.003, "vent", bevel=0)
        k.box((0.012, 0.045, 0.06), (side * 0.14, 0.3, -0.7), "steel", bevel=k.seg(0.004, 0))
    k.box((0.236, 0.06, 0.07), (0, 0.43, -0.2), "matt_black", bevel=k.seg(0.01, 0))
    k.rod((-0.16, 0.42, -0.1), (0.16, 0.42, -0.1), 0.018, "steel_dark", seg=k.seg(10, 6))
    k.rod((-0.16, 0.3, -0.7), (0.16, 0.3, -0.7), 0.012, "steel", seg=k.seg(8, 5))
    # The shock, off to the left, straight from frame to swingarm
    kc.shock(k, (-0.07, 0.66, -0.12), (-0.07, 0.44, -0.3), 0.028)
    kc.chain(k, -0.097, (0.4, -0.04, 0.04), (0.3, -0.7, 0.1))
    kc.caliper(k, (0.086, 0.3, -0.7), 0.12, math.radians(200), size=(0.085, 0.045))
    k.beam((0.112, 0.27, -0.79), (0.108, 0.3, -0.7), (0.012, 0.03), "dark_metal", bevel=0)
    kc.pegs(k, PEG, hanger_mat="matt_black", hanger=(0.5, -0.12))
    for side in (-1, 1):
        k.rod((side * 0.13, 0.52, -0.4), (side * 0.2, 0.52, -0.4), 0.01, "steel_dark", seg=k.seg(8, 5))
    k.side_stand((-0.15, 0.3, -0.02), (-0.27, 0.03, 0.06), 0.011, "steel_dark", seg=k.seg(8, 5))

    # ---- face: a black cowl round the split lamps, orange inner flanks, a
    # clear screen over the dash
    k.loft([(0.46, 0.76, 0.95, 0.07),
            (0.52, 0.73, 0.96, 0.105, 3, 3, 0.5, 0.8, 0.6),
            (0.58, 0.74, 0.93, 0.095, 3.5, 3.5, 0.5, 0.7, 0.5),
            (0.612, 0.75, 0.92, 0.075, 3, 3, 0.5, 0.7, 0.5)], "matt_black", ring=k.seg(18, 8), steps=k.seg(2, 1), sharp=28)
    for side in (-1, 1):
        kc.skin(k, [(0.6, 0.9), (0.52, 0.94), (0.48, 0.86), (0.56, 0.8)], lambda z: 0.09 + 0.05 * (0.6 - z), 0.012, "frame", side, bevel=0)
        kc.indicator(k, (side * 0.095, 0.9, 0.5), side, stalk=0.03, lens_size=(0.022, 0.012, 0.03))

    def screen(u, v):
        across = (v - 0.5) * 2
        return (across * (0.12 - 0.03 * u), 0.94 + 0.17 * u, 0.6 - 0.12 * u - 0.03 * across * across)
    k.sheet(screen, "glass", nu=3, nv=k.seg(4, 2), thick=0.004)

    # ---- tank in black between the shrouds, sloping hard to the seat
    k.loft([(0.42, 0.88, 0.96, 0.06),
            (0.36, 0.83, 1.0, 0.11, 2.6, 3),
            (0.24, 0.8, 1.025, 0.14, 2.6, 3, 0.45),
            (0.1, 0.8, 1.0, 0.14, 2.6, 3, 0.45),
            (-0.02, 0.82, 0.93, 0.12),
            (-0.08, 0.83, 0.88, 0.08)], "gloss_black", ring=k.seg(20, 10), steps=k.seg(3, 1))
    k.cylinder(0.035, 0.01, (0, 1.022, 0.27), "steel_dark", seg=k.seg(14, 8))

    # ---- shrouds: white wings, a black lower edge, the orange lightning flash
    def shroud_x(z):
        return 0.165 - 0.06 * kc.smooth((z - 0.3) / 0.25)
    shroud = [(0.56, 0.86), (0.45, 0.97), (0.26, 1.0), (0.08, 0.96), (0.05, 0.88), (0.2, 0.8), (0.4, 0.72), (0.53, 0.74)]
    for side in (-1, 1):
        kc.skin(k, shroud, shroud_x, 0.026, "paint", side, bevel=k.seg(0.007, 0))
        kc.skin(k, [(0.05, 0.89), (0.2, 0.81), (0.4, 0.73), (0.33, 0.74), (0.16, 0.8), (0.07, 0.86)], lambda z: shroud_x(z) + 0.015, 0.004, "matt_black", side, bevel=0)
        kc.skin(k, [(0.12, 0.96), (0.2, 0.94), (0.32, 0.85), (0.38, 0.86), (0.48, 0.77), (0.38, 0.81), (0.3, 0.8), (0.18, 0.9)],
                lambda z: shroud_x(z) + 0.015, 0.004, "frame", side, bevel=0)

    # ---- seat, pillion step and the sharp upswept tail
    k.loft([(-0.04, 0.81, 0.835, 0.09), (-0.1, 0.81, 0.845, 0.14, 3, 3), (-0.26, 0.815, 0.85, 0.13, 3, 3), (-0.32, 0.83, 0.865, 0.09)], "seat",
           ring=k.seg(16, 8), steps=k.seg(2, 1))
    k.loft([(-0.32, 0.88, 0.905, 0.06), (-0.36, 0.88, 0.925, 0.09, 3, 3), (-0.56, 0.9, 0.945, 0.075, 3, 3), (-0.62, 0.92, 0.95, 0.045)], "seat",
           ring=k.seg(14, 8), steps=k.seg(2, 1))
    k.loft([(-0.04, 0.7, 0.81, 0.12), (-0.24, 0.74, 0.84, 0.13, 3, 2.6), (-0.44, 0.8, 0.9, 0.11, 3, 2.6), (-0.64, 0.87, 0.94, 0.07, 3, 2.6),
            (-0.76, 0.92, 0.955, 0.03)], "gloss_black", ring=k.seg(16, 8), steps=k.seg(2, 1))
    for side in (-1, 1):
        # White tail flanks
        kc.skin(k, [(-0.36, 0.85), (-0.66, 0.92), (-0.68, 0.905), (-0.4, 0.82)], lambda z: 0.105 + 0.08 * (z + 0.36) * 0.4, 0.006, "paint", side, bevel=0)
    # Long plate hanger, plate and indicators
    k.beam((0, 0.85, -0.66), (0, 0.6, -0.96), (0.045, 0.02), "matt_black", bevel=k.seg(0.005, 0))
    kc.plate(k, (0, 0.56, -0.98), 0.22)
    for side in (-1, 1):
        kc.indicator(k, (side * 0.025, 0.66, -0.88), side, stalk=0.07, lens_size=(0.03, 0.012, 0.016))
    k.guard((0.3, -0.7), 0.335, 0.16, math.radians(100), math.radians(150), "matt_black", crown=0.025, nu=k.seg(8, 4))

    # ---- white front mudguard with an orange flash
    k.guard((0.3, 0.7), 0.33, 0.13, math.radians(52), math.radians(128), "paint", crown=0.03, nu=k.seg(8, 5))
    for side in (-1, 1):
        kc.skin(k, [(0.66, 0.6), (0.74, 0.6), (0.82, 0.55), (0.76, 0.55)], lambda z: 0.072, 0.004, "frame", side, bevel=0)

    # ---- lamps: two tall slim LED halves leaning out, each in a DRL outline
    k.begin("headlight", (0, 0.84, 0.62))
    # The split face: two angular lamp halves leaning out at the top, each a
    # dark lens with a bright LED block inside it and a DRL blade down its
    # outer edge, meeting in a point low in the middle, set in a black bezel
    lean = 0.28
    bezel = [(0.0, 0.775), (0.03, 0.75), (0.072, 0.8), (0.082, 0.905), (0.05, 0.93), (0.006, 0.91)]
    lamp = [(0.008, 0.79), (0.03, 0.768), (0.062, 0.805), (0.07, 0.895), (0.046, 0.912), (0.012, 0.895)]
    led = [(0.014, 0.8), (0.032, 0.785), (0.058, 0.815), (0.064, 0.888), (0.044, 0.902), (0.016, 0.885)]
    drl = [(0.062, 0.8), (0.07, 0.808), (0.079, 0.9), (0.07, 0.905)]
    for side in (-1, 1):
        flip = lambda pts: [(side * x, y) for x, y in (pts if side > 0 else reversed(pts))]
        kc.front_plate(k, flip(bezel), 0.606, 0.016, "matt_black", tilt=lean, bevel=k.seg(0.004, 0))
        kc.front_plate(k, flip(lamp), 0.616, 0.006, "lens", tilt=lean)
        kc.front_plate(k, flip(led), 0.62, 0.004, "headlight", tilt=lean)
        kc.front_plate(k, flip(drl), 0.618, 0.006, "headlight", tilt=lean)
    k.begin("brake_light", (0, 0.93, -0.76))
    k.box((0.06, 0.02, 0.025), (0, 0.932, -0.765), "brake", rot=(0.5, 0, 0), bevel=k.seg(0.005, 0))

    # ---- luggage: a black roll bag across the pillion
    k.begin("luggage", (0, 1.02, -0.48))
    kc.duffel(k, (0, 1.02, -0.48), 0.5, 0.23, 0.3)


kc.build_file(NAME, build, seed=909, colours=COLOURS, anchors={"grip": GRIP, "peg": PEG, "seat": SEAT})
