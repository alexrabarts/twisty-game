# bike-07 of the trip photos (and, with the "black" scheme, its blacked-out twin): a third-generation 890 cc crossplane-triple
# hyper-naked in matt black and dark grey (a rental in Switzerland, 2022).
# What makes it read as that bike: the compact face with one projector lamp
# under two slanted LED brows, the big angular intake shrouds either side of
# a short, tall tank, the black cast frame and swingarm, the bronze headers
# into a stubby box under the engine, a slim tail with the number plate hung
# off the swingarm on its own arm, black ten-spoke wheels, dark upside-down
# forks with radial calipers on twin discs, a wide high bar, and a black roll
# bag on the pillion. No badges, no lettering, a blank plate.
#
# Real dimensions in metres (17-inch wheels, 298 mm front and 245 mm rear
# discs, 825 mm seat), with the wheel centres where every game bike has them
# (y 0.3, z +-0.7): a 1.40 m wheelbase against the real 1.43 m.
#   blender --background --factory-startup --python tools/blender/bikes/bike07_mt09.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_c as kc  # noqa: E402
from _kit_c import FRONT, REAR, RAKE_CP3  # noqa: E402

NAME = "bike07_mt09"
GRIP = (0.34, 1.05, 0.32)
PEG = (0.2, 0.38, -0.22)
SEAT = (0, 0.835, -0.16)
# Colour schemes: "photo" is the bike in the trip photos (Lucy's); "black"
# is Guy's blacked-out one: all-black bodywork, wheels, covers, forks and
# frame, satin dark-grey contrast only, smoked lenses.
SCHEMES = {
    "photo": {
        "paint": 0x34373C,        # matt dark grey tank top and tail
        "paint_dark": 0x101114,
        "accent": 0x55595F,
        "rim": 0x141518,          # black wheels
        "caliper": 0x202226,
        "spring": 0x1E2024,
        "fork_gold": 0x23252A,    # the outer fork tubes, dark anodised
        "frame": 0x3A3D42,        # matt dark grey cast frame
        "engine": 0x2C2E32,
        "cover": 0x3A3D42,
        "bronze": 0x7A5C46,       # bronze-tinted headers
        "luggage": 0x1A1B1E,
    },
    "black": {
        "paint": 0x18191C,
        "paint_dark": 0x0B0B0D,
        "accent": 0x2C2E33,
        "rim": 0x0F1012,
        "caliper": 0x141518,
        "spring": 0x121315,
        "fork_gold": 0x111214,
        "frame": 0x1B1C1F,
        "engine": 0x151619,
        "cover": 0x1E2024,
        "bronze": 0x1D1D20,       # ceramic-black headers
        "luggage": 0x16171A,
        "lens": 0x050608,
        "signal": 0x4A3418,       # smoked indicator lenses
    },
}
SWINGARM = {"photo": "steel_dark", "black": "frame"}
scheme = "photo"


def build(k):
    hi = k.hi
    # ---- wheels and discs
    k.begin("wheel_rear", REAR)
    kc.wheel(k, REAR, 0.3, 0.18, 0.215, spokes=5, spread=0.2, blade=(0.011, 0.009))
    kc.sprocket(k, REAR, -0.097, 0.104)
    k.begin("wheel_front", FRONT)
    kc.wheel(k, FRONT, 0.3, 0.12, 0.215, spokes=5, spread=0.2, blade=(0.01, 0.008))
    k.begin("disc_rear", (0.086, 0.3, -0.7))
    kc.disc(k, (0.086, 0.3, -0.7), 0.1225)
    k.begin("disc_front", (0.068, 0.3, 0.7))
    for side in (-1, 1):
        kc.disc(k, (side * 0.068, 0.3, 0.7), 0.149)

    # ---- forks, clamps, bar
    kc.usd_forks(k, x=0.105, axle=(0.3, 0.7), top=0.95, rake=RAKE_CP3, outer=0.027, inner=0.0205, outer_mat="fork_gold", inner_mat="steel",
                 foot_mat="dark_metal", disc_x=0.068, disc_radius=0.149, caliper_angle=205, caps="steel_dark")
    k.begin("body")
    kc.clamps(k, 0.105, (0.3, 0.7), 0.935, 0.8, RAKE_CP3, 0.027, mat="dark_metal")
    k.begin("handlebar", (0, 0.99, 0.37))
    kc.handlebar(k, GRIP, (0.975, 0.385), 0.045, mat="dark_metal", mirrors=((0.21, 1.035, 0.345), (0.3, 1.19, 0.3), (0.07, 0.045)))
    # TFT dash on the top clamp, steering with the bar
    k.box((0.11, 0.075, 0.03), (0, 1.0, 0.405), "matt_black", rot=(-0.5, 0, 0), bevel=k.seg(0.008, 0))
    k.box((0.09, 0.055, 0.004), (0, 1.006, 0.42), "dash", rot=(-0.5, 0, 0), bevel=0)
    if hi:
        # Brake and clutch lines down from the bar
        for side in (-1, 1):
            k.tube([(side * 0.25, 1.03, 0.36), (side * 0.12, 0.98, 0.45), (side * 0.12, 0.9, 0.47)], 0.0045, "matt_black", seg=5, smooth=2)

    # ---- the platform: frame, engine, exhaust, swingarm, chain, pegs
    kc.cp3_chassis(k, frame_mat="frame", swing_mat=SWINGARM[scheme], peg=PEG, engine_scale=1.04)
    k.begin("body")

    # ---- face: a tall, narrow black mask that carries the lamps, a small
    # smoked screen on top
    k.loft([(0.44, 0.72, 0.98, 0.07),
            (0.5, 0.69, 1.0, 0.115, 3, 3, 0.5, 0.8, 0.7),
            (0.575, 0.7, 0.985, 0.11, 3.5, 3.5, 0.5, 0.72, 0.62),
            (0.62, 0.73, 0.95, 0.088, 3.5, 3.5, 0.5, 0.7, 0.65),
            (0.64, 0.755, 0.9, 0.06, 3, 3)], "matt_black", ring=k.seg(18, 8), steps=k.seg(2, 1), sharp=28)
    if hi:
        # Angular fangs down the mask's flanks, beside the projector
        for side in (-1, 1):
            kc.skin(k, [(0.63, 0.9), (0.6, 0.76), (0.56, 0.7), (0.58, 0.8)], lambda z: 0.072 + 0.05 * (0.63 - z), 0.012, "gloss_black", side, bevel=0)
    def screen(u, v):
        across = (v - 0.5) * 2
        return (across * (0.075 - 0.02 * u), 0.955 + 0.06 * u, 0.56 - 0.08 * u - 0.015 * across * across)
    k.sheet(screen, "glass", nu=2, nv=k.seg(4, 2), thick=0.004)
    if hi:
        # Mounting bosses either side of the mask
        for side in (-1, 1):
            k.cylinder(0.009, 0.01, (side * 0.088, 0.9, 0.57), "steel_dark", axis="x", seg=8)

    # ---- tank: matt grey top, crowned, stepping down to the seat
    k.loft([(0.42, 0.9, 0.98, 0.06),
            (0.36, 0.86, 1.02, 0.12, 2.6, 3),
            (0.24, 0.84, 1.045, 0.15, 2.6, 3, 0.45),
            (0.1, 0.84, 1.04, 0.155, 2.6, 3, 0.45, 0.85),
            (0.0, 0.84, 0.99, 0.14, 2.6, 3, 0.5, 0.8),
            (-0.06, 0.85, 0.92, 0.09)], "paint", ring=k.seg(22, 10), steps=k.seg(3, 1))
    k.cylinder(0.04, 0.01, (0, 1.045, 0.24), "matt_black", seg=k.seg(16, 8))
    if hi:
        k.cylinder(0.03, 0.006, (0, 1.051, 0.24), "steel_dark", seg=12)

    # ---- the intake scoops: big gloss-black blades off the tank's flanks,
    # sharp and pointing forward to the mask, the intake mouth under the
    # front edge, and the louvred radiator covers below
    def scoop_x(z):
        return 0.19 - 0.075 * kc.smooth((z - 0.3) / 0.25) - 0.03 * kc.smooth((0.12 - z) / 0.14)
    # Rows front to back: (z, y, x) down the outer face, top edge, upper
    # crease, lower crease, bottom edge; the facets meet in sharp creases
    scoop = [
        [(0.6, 0.9, 0.1), (0.6, 0.87, 0.112), (0.6, 0.845, 0.11), (0.6, 0.83, 0.1)],
        [(0.5, 0.965, 0.145), (0.5, 0.9, 0.18), (0.5, 0.835, 0.172), (0.5, 0.785, 0.148)],
        [(0.34, 1.0, 0.172), (0.34, 0.915, 0.214), (0.34, 0.84, 0.206), (0.34, 0.77, 0.176)],
        [(0.18, 1.0, 0.178), (0.18, 0.92, 0.216), (0.18, 0.85, 0.206), (0.18, 0.79, 0.18)],
        [(0.05, 0.955, 0.168), (0.05, 0.915, 0.19), (0.05, 0.88, 0.185), (0.05, 0.855, 0.166)],
        [(0.0, 0.93, 0.155), (0.0, 0.915, 0.165), (0.0, 0.9, 0.163), (0.0, 0.89, 0.155)],
    ]
    for side in (-1, 1):
        kc.blade(k, scoop, 0.025, "gloss_black", side)
        # A matt grey inset along the upper crease
        kc.blade(k, [[(0.44, 0.912, 0.2), (0.44, 0.902, 0.2)], [(0.12, 0.922, 0.218), (0.12, 0.912, 0.218)]], 0.004, "paint", side)
        # The intake mouth: a black hollow under the blade's front edge
        kc.skin(k, [(0.55, 0.82), (0.4, 0.78), (0.3, 0.79), (0.42, 0.83)], lambda z: scoop_x(z) - 0.01, 0.03, "vent", side, bevel=0)
        # Radiator side cover with its louvres
        kc.skin(k, [(0.5, 0.79), (0.48, 0.6), (0.4, 0.47), (0.31, 0.5), (0.3, 0.64), (0.34, 0.78)], lambda z: 0.19 + 0.02 * (z - 0.3), 0.02, "matt_black", side,
                bevel=k.seg(0.006, 0))
        if hi:
            for n in range(5):
                y = 0.55 + n * 0.042
                k.box((0.006, 0.008, 0.13 - n * 0.006), (side * 0.205, y, 0.41 - n * 0.004), "steel_dark", rot=(0.25, 0, 0), bevel=0)
        # Front indicator on the cover
        kc.indicator(k, (side * 0.2, 0.62, 0.47), side, stalk=0.022, lens_size=(0.024, 0.014, 0.02))

    # ---- seat, pillion and the slim tail
    k.loft([(-0.03, 0.8, 0.83, 0.1), (-0.09, 0.8, 0.84, 0.15, 3, 3), (-0.24, 0.8, 0.84, 0.15, 3, 3), (-0.33, 0.81, 0.86, 0.11, 3, 3),
            (-0.37, 0.84, 0.875, 0.07)], "seat", ring=k.seg(16, 8), steps=k.seg(2, 1))
    k.loft([(-0.36, 0.88, 0.9, 0.06), (-0.4, 0.88, 0.925, 0.095, 3, 3), (-0.58, 0.9, 0.945, 0.08, 3, 3), (-0.64, 0.915, 0.95, 0.05)], "seat",
           ring=k.seg(14, 8), steps=k.seg(2, 1))
    k.loft([(-0.04, 0.66, 0.8, 0.13),
            (-0.2, 0.69, 0.82, 0.14, 3, 2.6),
            (-0.4, 0.76, 0.9, 0.12, 3, 2.6),
            (-0.6, 0.83, 0.93, 0.09, 3, 2.6),
            (-0.74, 0.87, 0.935, 0.05, 3, 2.6),
            (-0.8, 0.89, 0.93, 0.025)], "paint_dark", ring=k.seg(16, 8), steps=k.seg(2, 1))
    if hi:
        # Grab rail recesses under the tail
        for side in (-1, 1):
            k.panel([(-0.5, 0.82), (-0.66, 0.85), (-0.66, 0.83), (-0.5, 0.8)], side * 0.1, 0.006, "matt_black", bevel=0)

    # ---- rear hugger and the swingarm-mounted plate arm with indicators
    k.guard((0.3, -0.7), 0.335, 0.16, math.radians(95), math.radians(152), "matt_black", crown=0.025, nu=k.seg(8, 4))
    k.tube([(0.125, 0.31, -0.72), (0.125, 0.36, -0.86), (0.08, 0.44, -0.98), (0.0, 0.48, -1.01)], (0.018, 0.016, 0.014, 0.014), "matt_black",
           seg=k.seg(8, 5), smooth=k.seg(3, 1))
    kc.plate(k, (0, 0.53, -1.03), 0.15)
    for side in (-1, 1):
        kc.indicator(k, (side * 0.09, 0.5, -1.015), side, stalk=0.04)
    if hi:
        k.box((0.06, 0.012, 0.012), (0, 0.6, -1.04), "steel_dark", bevel=0)

    # ---- front mudguard
    k.guard((0.3, 0.7), 0.33, 0.13, math.radians(38), math.radians(140), "gloss_black", crown=0.03, nu=k.seg(9, 5))
    if hi:
        for side in (-1, 1):
            k.box((0.03, 0.06, 0.1), (side * 0.078, 0.52, 0.66), "gloss_black", rot=(-RAKE_CP3, 0, 0), bevel=0.004)

    # ---- lamps
    k.begin("headlight", (0, 0.82, 0.63))
    # One projector low in the mask, two slanted LED brows high on it
    k.cylinder(0.036, 0.03, (0, 0.79, 0.625), "matt_black", axis="z", seg=k.seg(20, 10))
    k.cylinder(0.029, 0.006, (0, 0.79, 0.641), "lens", axis="z", seg=k.seg(20, 10))
    k.cylinder(0.017, 0.004, (0, 0.79, 0.645), "headlight", axis="z", seg=k.seg(16, 8))
    for side in (-1, 1):
        k.box((0.055, 0.01, 0.012), (side * 0.035, 0.872, 0.622), "headlight", rot=(-0.2, 0, side * 0.5), bevel=k.seg(0.003, 0))
        k.box((0.035, 0.008, 0.01), (side * 0.06, 0.84, 0.618), "headlight", rot=(-0.2, -side * 0.4, side * 1.2), bevel=k.seg(0.002, 0))
    k.begin("brake_light", (0, 0.865, -0.8))
    k.box((0.07, 0.016, 0.03), (0, 0.868, -0.8), "brake", rot=(0.4, 0, 0), bevel=k.seg(0.005, 0))
    if hi:
        for side in (-1, 1):
            k.box((0.03, 0.01, 0.012), (side * 0.04, 0.872, -0.785), "brake", rot=(0.4, 0, side * 0.3), bevel=0.003)

    # ---- luggage: a big black roll bag across the pillion
    k.begin("luggage", (0, 1.0, -0.52))
    kc.duffel(k, (0, 1.02, -0.52), 0.5, 0.25, 0.32)
    if hi:
        k.box((0.3, 0.05, 0.04), (0, 0.9, -0.66), "matt_black", bevel=0.01)


for scheme, suffix in (("photo", ""), ("black", "_black")):
    kc.build_file(NAME + suffix, build, seed=907, colours=SCHEMES[scheme], anchors={"grip": GRIP, "peg": PEG, "seat": SEAT})
