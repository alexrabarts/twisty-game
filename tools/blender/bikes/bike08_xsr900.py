# bike-08 of the trip photos: a 2022-on retro roadster on the 890 cc
# crossplane-triple platform, in deep metallic blue (Alps 2023). What makes
# it read as that bike: the long flat-topped blue tank with black knee
# insets and a thin gold pinstripe at its front, the blue side panel with a
# black inset under the seat, a round LED headlamp in a black bucket, gold
# upside-down forks and gold ten-spoke wheels, a long flat tan seat over a
# short black tail with the plate on a hanger, a blue front mudguard,
# silver-grey engine covers, bronze headers into the box under the engine,
# round bar-end mirrors (an owner's fit), and a black roll bag on the
# pillion. No badges, no lettering, a blank plate.
#
# Real dimensions in metres (17-inch wheels, 298 mm front and 245 mm rear
# discs, 810 mm seat), with the wheel centres where every game bike has them
# (y 0.3, z +-0.7): a 1.40 m wheelbase against the real 1.495 m.
#   blender --background --factory-startup --python tools/blender/bikes/bike08_xsr900.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_c as kc  # noqa: E402
from _kit_c import FRONT, REAR, RAKE_CP3  # noqa: E402

NAME = "bike08_xsr900"
GRIP = (0.34, 1.01, 0.33)
PEG = (0.2, 0.38, -0.21)
SEAT = (0, 0.82, -0.17)
COLOURS = {
    "paint": 0x1C5DB4,        # deep metallic blue
    "paint_dark": 0x0A1F3C,
    "accent": 0xC9A23A,
    "rim": 0xA8874A,          # gold wheels
    "fork_gold": 0xC0943A,    # gold outer fork tubes
    "caliper": 0x26282C,
    "spring": 0x2A2C30,
    "frame": 0x3C3F44,        # dark grey frame
    "engine": 0x5C6066,      # mid-grey cast block
    "cover": 0x9A9EA4,        # silver-grey engine covers
    "bronze": 0x86664C,
    "seat_tan": 0x8C6A4A,
    "luggage": 0x1A1B1E,
}


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

    # ---- gold forks, clamps, a flat bar with round bar-end mirrors
    kc.usd_forks(k, x=0.105, axle=(0.3, 0.7), top=0.95, rake=RAKE_CP3, outer=0.027, inner=0.0205, outer_mat="fork_gold", inner_mat="chrome",
                 foot_mat="matt_black", disc_x=0.068, disc_radius=0.149, caliper_angle=205, caps="fork_gold")
    k.begin("body")
    kc.clamps(k, 0.105, (0.3, 0.7), 0.935, 0.8, RAKE_CP3, 0.027, mat="matt_black")
    k.begin("handlebar", (0, 0.97, 0.37))
    kc.handlebar(k, GRIP, (0.965, 0.385), 0.03, mat="matt_black", bar_end_mirrors=0.04)
    # Small round-cornered dash on the top clamp
    k.box((0.1, 0.07, 0.03), (0, 0.99, 0.41), "matt_black", rot=(-0.6, 0, 0), bevel=k.seg(0.012, 0))
    k.box((0.08, 0.05, 0.004), (0, 0.996, 0.425), "dash", rot=(-0.6, 0, 0), bevel=0)
    if hi:
        for side in (-1, 1):
            k.tube([(side * 0.25, 1.0, 0.36), (side * 0.12, 0.96, 0.45), (side * 0.12, 0.88, 0.47)], 0.0045, "matt_black", seg=5, smooth=2)

    # ---- the platform, with silver covers and a bronze exhaust box
    kc.cp3_chassis(k, frame_mat="frame", swing_mat="frame", cover_mat="cover", box_mat="bronze", shield_mat="bronze", peg=PEG, engine_scale=1.08, cam_mat="cover")
    k.begin("body")

    # ---- round headlamp bucket on brackets off the bottom clamp, a short
    # black cowl over it
    k.lathe([(0, -0.06), (0.06, -0.06), (0.085, -0.03), (0.092, 0.0), (0.092, 0.012), (0.0, 0.012)], (0, 0.86, 0.56), "matt_black", axis="z",
            seg=k.seg(28, 12))
    k.lathe([(0.092, 0.012), (0.094, 0.02), (0.086, 0.024)], (0, 0.86, 0.56), "matt_black", axis="z", seg=k.seg(28, 12))
    k.loft([(0.5, 0.92, 0.97, 0.07), (0.56, 0.9, 0.975, 0.08, 3, 2.4, 0.5, 0.9), (0.6, 0.92, 0.965, 0.06, 3, 2.4)], "matt_black", ring=k.seg(12, 6), steps=1)
    for side in (-1, 1):
        k.beam((side * 0.09, 0.86, 0.53), (side * 0.11, 0.8, 0.47), (0.012, 0.03), "matt_black", bevel=0)
        kc.indicator(k, (side * 0.1, 0.8, 0.5), side, stalk=0.045, lens_size=(0.022, 0.022, 0.026))

    # ---- tank: long, flat on top, full at the knees, deep metallic blue
    k.loft([(0.43, 0.87, 0.95, 0.07),
            (0.38, 0.79, 0.985, 0.13, 3, 3),
            (0.26, 0.74, 1.0, 0.172, 3.4, 3.4, 0.4),
            (0.1, 0.73, 1.0, 0.18, 3.4, 3.4, 0.42, 0.9),
            (-0.02, 0.75, 0.965, 0.16, 3, 3, 0.5, 0.85),
            (-0.08, 0.79, 0.9, 0.1)], "paint", ring=k.seg(24, 10), steps=k.seg(3, 1))
    k.cylinder(0.042, 0.01, (0, 1.002, 0.26), "steel_dark", seg=k.seg(16, 8))
    for side in (-1, 1):
        # Black knee inset low on the tank's flank
        kc.skin(k, [(0.22, 0.93), (0.08, 0.935), (0.0, 0.9), (0.02, 0.84), (0.18, 0.835), (0.24, 0.88)], lambda z: 0.176 - 0.02 * kc.smooth((z - 0.16) / 0.1),
                0.006, "matt_black", side, bevel=0)
        # The thin gold pinstripe down the tank's front
        kc.skin(k, [(0.355, 0.99), (0.34, 0.99), (0.3, 0.85), (0.315, 0.85)], lambda z: 0.13 + 0.25 * (0.38 - z), 0.006, "fork_gold", side, bevel=0)
        # Radiator side covers: black, with vertical slats
        kc.skin(k, [(0.48, 0.78), (0.47, 0.55), (0.4, 0.46), (0.33, 0.5), (0.33, 0.7), (0.38, 0.79)], lambda z: 0.19, 0.016, "matt_black", side,
                bevel=k.seg(0.005, 0))
        if hi:
            for n in range(5):
                k.box((0.006, 0.2, 0.008), (side * 0.2, 0.64, 0.36 + n * 0.024), "steel_dark", rot=(0.12, 0, 0), bevel=0)
        # Side panel under the seat front: blue, with a black inset
        kc.skin(k, [(0.0, 0.83), (-0.24, 0.81), (-0.3, 0.73), (-0.14, 0.68), (-0.01, 0.71)], lambda z: 0.15, 0.024, "paint", side, bevel=k.seg(0.008, 0))
        kc.skin(k, [(-0.05, 0.79), (-0.22, 0.78), (-0.25, 0.73), (-0.12, 0.71), (-0.05, 0.73)], lambda z: 0.163, 0.004, "matt_black", side, bevel=0)

    # ---- long flat tan seat, black skirt, short black tail
    k.loft([(-0.04, 0.77, 0.82, 0.1), (-0.1, 0.77, 0.835, 0.15, 3.5, 3), (-0.3, 0.775, 0.84, 0.15, 3.5, 3), (-0.48, 0.79, 0.865, 0.135, 3.5, 3),
            (-0.6, 0.8, 0.88, 0.11, 3.5, 3), (-0.65, 0.81, 0.875, 0.07)], "seat_tan", ring=k.seg(18, 8), steps=k.seg(2, 1))
    if hi:
        # Piping round the seat's edge
        k.loft([(-0.05, 0.8, 0.812, 0.152), (-0.3, 0.8, 0.812, 0.155), (-0.62, 0.815, 0.827, 0.115)], "matt_black", ring=12, steps=2)
    k.loft([(-0.04, 0.68, 0.8, 0.13),
            (-0.25, 0.71, 0.81, 0.14, 3, 2.6),
            (-0.48, 0.73, 0.83, 0.125, 3, 2.6),
            (-0.64, 0.76, 0.85, 0.09, 3, 2.6),
            (-0.72, 0.78, 0.845, 0.05)], "matt_black", ring=k.seg(16, 8), steps=k.seg(2, 1))
    # Plate hanger down and back from under the tail, plate and indicators
    k.beam((0, 0.76, -0.68), (0, 0.66, -0.94), (0.05, 0.02), "matt_black", bevel=k.seg(0.005, 0))
    kc.plate(k, (0, 0.6, -0.985), 0.2)
    for side in (-1, 1):
        kc.indicator(k, (side * 0.03, 0.7, -0.9), side, stalk=0.085, lens_size=(0.022, 0.018, 0.024))
    k.guard((0.3, -0.7), 0.335, 0.16, math.radians(95), math.radians(150), "matt_black", crown=0.025, nu=k.seg(8, 4))

    # ---- blue front mudguard on its stays
    k.guard((0.3, 0.7), 0.33, 0.13, math.radians(38), math.radians(142), "paint", crown=0.03, nu=k.seg(9, 5))
    if hi:
        for side in (-1, 1):
            k.box((0.02, 0.06, 0.1), (side * 0.076, 0.53, 0.66), "matt_black", rot=(-RAKE_CP3, 0, 0), bevel=0.004)

    # ---- lamps: the round LED lens with its ring, the small tail lamp
    k.begin("headlight", (0, 0.86, 0.575))
    k.cylinder(0.082, 0.006, (0, 0.86, 0.575), "lens", axis="z", seg=k.seg(28, 12))
    k.lathe([(0.06, 0.0), (0.075, 0.0), (0.075, 0.004), (0.06, 0.004)], (0, 0.86, 0.577), "headlight", axis="z", seg=k.seg(28, 12))
    k.cylinder(0.03, 0.006, (0, 0.86, 0.579), "headlight", axis="z", seg=k.seg(20, 10))
    if hi:
        k.box((0.1, 0.006, 0.004), (0, 0.86, 0.582), "steel", bevel=0)
    k.begin("brake_light", (0, 0.77, -0.73))
    k.box((0.11, 0.022, 0.025), (0, 0.772, -0.735), "brake", rot=(-0.3, 0, 0), bevel=k.seg(0.006, 0))

    # ---- luggage: a black roll bag strapped across the pillion
    k.begin("luggage", (0, 0.98, -0.52))
    kc.duffel(k, (0, 0.99, -0.53), 0.48, 0.26, 0.33)


kc.build_file(NAME, build, seed=908, colours=COLOURS, anchors={"grip": GRIP, "peg": PEG, "seat": SEAT})
