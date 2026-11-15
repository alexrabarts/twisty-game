# The maxi scooter (Tim): a deep nose fairing over a small fat front wheel, a
# tall screen, a flat footboard either side of a centre tunnel, one long
# stepped seat on a full rear body, the drive case as the swingarm.
#
# Wheel centres, bar, footboard, seat and brake light stand where
# Vehicle.buildScooter puts them (js/vehicle.js).
#   blender --background --factory-startup --python tools/blender/bike_scooter.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bike_parts as parts  # noqa: E402
from bike_kit import Kit  # noqa: E402
from common import ASSETS  # noqa: E402

OUT = os.path.join(ASSETS, "bikes", "scooter.glb")
FRONT, REAR = (0, 0.3, 0.7), (0, 0.3, -0.7)
GRIP = (0.21, 1.11, 0.53)
# Where the foot rests on the board
PEG = (0.13, 0.44, 0.24)


def build():
    k = Kit(seed=13, colours={"paint": 0x8D96A8, "paint_dark": 0x2A2D32, "accent": 0x30343C, "caliper": 0x3A3E46, "rim": 0xCFD2D6, "spring": 0x2A2D32})

    k.begin("wheel_rear", REAR)
    k.wheel(REAR, 0.30, 0.17, 0.175, style="cast", spokes=5, hub=0.06)
    k.begin("wheel_front", FRONT)
    k.wheel(FRONT, 0.28, 0.15, 0.165, style="cast", spokes=5, hub=0.055)
    k.begin("disc_rear", (0.09, 0.3, -0.7))
    k.disc((0.098, 0.3, -0.7), 0.105)
    k.begin("disc_front", (0.09, 0.3, 0.7))
    k.disc((0.088, 0.3, 0.7), 0.12)

    parts.forks(k, x=0.105, axle=(0.3, 0.7), top=(0.7, 0.6), radius=0.02, pivot=(0.08, 0.5, 0.68), caliper_radius=0.12, disc_x=0.088, lower="steel_dark")

    k.begin("handlebar", (0, 1.12, 0.55))
    parts.bars(k, GRIP, clamp=(1.08, 0.53), rise=0.02, mat="dark_metal")
    parts.mirror(k, (0.16, 1.12, 0.54), (0.3, 1.3, 0.52), mat="chrome")
    # The shroud over the bars, with its dials
    k.loft([(0.44, 1.02, 1.13, 0.07), (0.48, 1.0, 1.16, 0.15, 3, 3), (0.58, 1.0, 1.15, 0.15, 3, 3), (0.63, 1.02, 1.1, 0.08)], "trim", ring=10, steps=2)
    for side in (-1, 1):
        k.cylinder(0.034, 0.008, (side * 0.055, 1.158, 0.5), "dash", rot=(-0.5, 0, 0), seg=12)

    k.begin("brake_light", (0, 0.76, -0.84))
    k.loft([(-0.93, 0.76, 0.82, 0.1, 3, 3), (-0.955, 0.765, 0.815, 0.08, 3, 3), (-0.962, 0.775, 0.805, 0.04)], "brake", ring=10, steps=1)

    k.begin("headlight", (0, 0.85, 0.72))
    k.loft([(0.775, 0.83, 0.9, 0.13, 2.2, 2.6), (0.815, 0.835, 0.89, 0.1, 2.2, 2.6), (0.832, 0.85, 0.875, 0.04)], "headlight", ring=10, steps=1)

    k.begin("body")

    # Nose fairing: stands behind the front wheel at the bottom and leans out
    # over it above, up to the screen
    k.loft([
        (0.38, 0.28, 0.36, 0.13),
        (0.5, 0.29, 0.39, 0.19, 3, 3),
        (0.6, 0.3, 0.5, 0.215, 3, 2.6),
        (0.68, 0.32, 0.72, 0.23, 3, 2.4),
        (0.82, 0.37, 0.8, 0.235, 3, 2.3),
        (0.96, 0.43, 0.75, 0.215, 3, 2.3),
        (1.07, 0.47, 0.65, 0.18, 3, 2.4),
        (1.13, 0.5, 0.58, 0.11),
    ], lambda u, up, side: "trim" if up < -0.55 else "paint", axis="y", ring=18, steps=3)
    for side in (-1, 1):
        k.box((0.05, 0.03, 0.03), (side * 0.19, 0.93, 0.73), "signal", rot=(0, side * 0.7, 0), bevel=0.01)
    k.box((0.3, 0.012, 0.02), (0, 0.79, 0.808), "chrome", bevel=0)
    k.guard((0.3, 0.7), 0.305, 0.18, math.radians(30), math.radians(150), "paint", crown=0.05, nu=10)

    # Tall commuter screen
    def screen(u, v):
        across = (v - 0.5) * 2
        half = 0.2 - 0.05 * u
        return (across * half, 1.08 + 0.5 * u, 0.67 - 0.26 * u ** 1.2 - 0.09 * across * across)

    k.sheet(screen, "glass", nu=6, nv=6, thick=0.006)

    # Footboards with rubber strips, the tunnel between them, the skirts below
    k.box((0.44, 0.07, 0.5), (0, 0.412, 0.14), "trim", bevel=0.012)
    for side in (-1, 1):
        for x in (0.1, 0.165):
            k.box((0.04, 0.008, 0.4), (side * x, 0.45, 0.16), "rubber", bevel=0)
    k.loft([(0.4, 0.4, 0.6, 0.06), (0.3, 0.4, 0.6, 0.065, 3, 3), (0.12, 0.4, 0.62, 0.07, 3, 3), (0.0, 0.4, 0.72, 0.09, 3, 3), (-0.06, 0.4, 0.78, 0.12)], "paint", ring=10, steps=2)
    k.loft([(0.42, 0.26, 0.4, 0.17), (0.3, 0.22, 0.4, 0.215, 3, 3), (0.0, 0.22, 0.4, 0.22, 3, 3), (-0.2, 0.26, 0.42, 0.2, 3, 3), (-0.3, 0.3, 0.42, 0.14)], "paint_dark", ring=12, steps=2)

    # Rear body: full sides from the seat down, arched over the wheel, to a tail
    def rear(u, up, side):
        return "trim" if up < -0.8 else ("chrome" if (0.1 < u < 0.8 and -0.25 < up < -0.05) else "paint")

    k.loft([
        (0.0, 0.4, 0.78, 0.15),
        (-0.1, 0.38, 0.84, 0.2, 3, 3),
        (-0.3, 0.42, 0.87, 0.215, 3, 3),
        (-0.46, 0.58, 0.9, 0.21, 3, 3),
        (-0.66, 0.63, 0.92, 0.19, 3, 3),
        (-0.84, 0.7, 0.9, 0.14, 3, 3),
        (-0.93, 0.75, 0.86, 0.09),
    ], rear, ring=20, steps=3)
    k.box((0.14, 0.1, 0.008), (0, 0.62, -0.96), "plate", rot=(0.15, 0, 0), bevel=0)
    k.beam((0, 0.74, -0.9), (0, 0.6, -0.965), (0.05, 0.015), "trim", bevel=0)

    # One long stepped seat and a backrest, with a grab rail round the tail
    k.loft([(0.04, 0.82, 0.88, 0.1), (-0.04, 0.8, 0.9, 0.17, 3.2, 3), (-0.26, 0.82, 0.905, 0.19, 3.2, 3), (-0.4, 0.86, 0.93, 0.18, 3.2, 3), (-0.44, 0.88, 0.95, 0.15)],
           "seat", ring=14, steps=2)
    k.loft([(-0.43, 0.9, 0.97, 0.13), (-0.48, 0.89, 0.99, 0.175, 3.2, 3), (-0.68, 0.91, 1.0, 0.165, 3.2, 3), (-0.8, 0.93, 0.99, 0.12)], "pillion", ring=14, steps=2)
    k.loft([(0.97, -0.9, -0.82, 0.08), (1.02, -0.92, -0.83, 0.13, 3, 3), (1.12, -0.95, -0.86, 0.13, 3, 3), (1.17, -0.95, -0.89, 0.08)], "pillion", axis="y", ring=10, steps=2)
    k.tube([(-0.2, 0.93, -0.52), (-0.23, 0.95, -0.76), (-0.14, 0.97, -0.94), (0.14, 0.97, -0.94), (0.23, 0.95, -0.76), (0.2, 0.93, -0.52)], 0.013, "chrome", seg=6, smooth=3)

    # Drive case as the swingarm on the left, the can on the right
    k.loft([(-0.08, 0.26, 0.44, 0.04, 3, 3, 0.5, 1, 1, -0.15), (-0.3, 0.22, 0.44, 0.05, 3, 3, 0.5, 1, 1, -0.16), (-0.62, 0.22, 0.4, 0.045, 3, 3, 0.5, 1, 1, -0.15),
            (-0.8, 0.25, 0.36, 0.03, 3, 3, 0.5, 1, 1, -0.14)], "steel", ring=10, steps=2)
    k.lathe([(0, 0), (0.085, 0), (0.085, 0.02), (0.055, 0.04), (0, 0.04)], (-0.2, 0.34, -0.26), "steel_dark", axis="x", rot=(0, 0, math.pi), seg=14)
    k.beam((0.13, 0.36, -0.2), (0.13, 0.3, -0.72), (0.035, 0.06), "steel_dark", bevel=0.008)
    for side in (-1, 1):
        parts.shock(k, (side * 0.15, 0.64, -0.56), (side * 0.15, 0.34, -0.7), 0.028)
    parts.caliper(k, (0.098, 0.3, -0.7), 0.105, math.radians(160))
    k.tube([(0.1, 0.34, -0.02), (0.15, 0.27, -0.12), (0.17, 0.27, -0.26)], 0.02, "steel", seg=7, smooth=3)
    parts.can(k, (0.17, 0.27, -0.26), (0.215, 0.42, -0.88), 0.065, "chrome", cap="dark_metal")
    k.box((0.012, 0.07, 0.34), (0.272, 0.36, -0.6), "trim", rot=(0.24, 0, 0), bevel=0.004)

    # Centre stand, folded
    for side in (-1, 1):
        k.rod((side * 0.1, 0.24, -0.1), (side * 0.14, 0.1, -0.3), 0.011, "steel_dark", seg=6)

    k.finish(OUT, anchors={"grip": GRIP, "peg": PEG}, budget=12000, alone=("wheel_front", "wheel_rear", "disc_front", "disc_rear"))
    parts.preview(k, "scooter")


build()
