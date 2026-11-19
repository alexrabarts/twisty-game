# The dirt bike (Shane): tall and thin on long forks, knobbly tyres on wire
# wheels, a high front mudguard and number plate, radiator shrouds round a
# small tank, a long flat seat, an upswept rear mudguard and a high silencer.
#
# Wheel centres, bar, pegs, seat and tail light stand where
# Vehicle.buildDirtBike puts them (js/vehicle.js). It has no headlight.
#   blender --background --factory-startup --python tools/blender/bike_dirt.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bike_parts as parts  # noqa: E402
from bike_kit import Kit  # noqa: E402
from common import ASSETS  # noqa: E402

OUT = os.path.join(ASSETS, "bikes", "dirt.glb")
FRONT, REAR = (0, 0.3, 0.7), (0, 0.3, -0.7)
GRIP = (0.27, 1.13, 0.51)
PEG = (0.19, 0.43, -0.08)


def build():
    k = Kit(seed=14, colours={"paint": 0xFF6600, "paint_dark": 0x4D1F00, "accent": 0xFFFFFF, "caliper": 0x9AA0A6, "rim": 0x23252B, "spring": 0xECEFF1})

    k.begin("wheel_rear", REAR)
    k.wheel(REAR, 0.28, 0.11, 0.2, style="wire", tread="knobby")
    parts.sprocket(k, REAR, -0.085, 0.125)
    k.begin("wheel_front", FRONT)
    k.wheel(FRONT, 0.30, 0.08, 0.24, style="wire", tread="knobby")
    k.begin("disc_rear", (0.09, 0.3, -0.7))
    # Inboard of the swingarm, whose inner face is at x 0.07
    k.disc((0.06, 0.3, -0.7), 0.11)
    k.begin("disc_front", (0.09, 0.3, 0.7))
    k.disc((0.055, 0.3, 0.7), 0.13)

    # Long-travel inverted forks behind plastic guards
    top = (1.02, 0.47)
    parts.forks(k, x=0.09, axle=(0.3, 0.7), top=top, radius=0.022, usd=True, pivot=(0.08, 0.62, 0.66), caliper_radius=0.13, disc_x=0.055, shields="plastic")

    k.begin("handlebar", (0, 1.12, 0.52))
    parts.bars(k, GRIP, clamp=(1.06, 0.46), rise=0.08, mat="steel", crossbar=True)

    k.begin("brake_light", (0, 1.04, -0.8))
    k.box((0.07, 0.03, 0.03), (0, 1.0, -0.86), "brake", rot=(-0.28, 0, 0), bevel=0.008)

    k.begin("body")

    # High front mudguard and the number plate on the forks
    def fender(u, v):
        across = (v - 0.5) * 2
        z = 0.36 + 0.7 * u
        half = 0.085 - 0.03 * abs(u - 0.4)
        return (across * half, 0.8 + 0.07 * math.sin(u * math.pi * 0.9) - 0.035 * across * across - 0.03 * u, z)

    k.sheet(fender, "paint", nu=10, nv=4, thick=0.012)
    k.loft([(0.84, 0.575, 0.6, 0.075, 3, 3), (0.94, 0.59, 0.62, 0.105, 3, 3), (1.04, 0.57, 0.6, 0.095, 3, 3), (1.1, 0.56, 0.585, 0.06, 3, 3)], "plastic", axis="y", ring=10, steps=1)
    k.box((0.012, 0.09, 0.012), (0, 0.97, 0.625), "dark_metal", rot=(-0.25, 0, 0), bevel=0)

    # Slim tank under the front of the seat, radiator shrouds flaring out each side
    k.loft([(0.4, 0.84, 0.94, 0.07), (0.32, 0.78, 1.0, 0.12, 2.6, 2.6), (0.16, 0.76, 0.99, 0.125, 2.6, 2.6), (0.02, 0.78, 0.95, 0.1, 2.6, 2.6), (-0.06, 0.8, 0.92, 0.07)],
           "paint", ring=12, steps=2)
    k.cylinder(0.03, 0.02, (0, 1.0, 0.31), "dark_metal", seg=10)
    for side in (-1, 1):
        k.panel([(0.44, 0.7), (0.52, 0.86), (0.44, 0.98), (0.24, 1.0), (0.0, 0.95), (0.04, 0.82), (0.24, 0.68)], side * 0.165, 0.03, "paint", toe=side * -0.2, bevel=0.01)
        k.panel([(0.42, 0.8), (0.47, 0.88), (0.2, 0.93), (0.1, 0.9)], side * 0.186, 0.012, "accent", toe=side * -0.2, bevel=0)
        k.box((0.03, 0.17, 0.11), (side * 0.12, 0.76, 0.32), "dark_metal", rot=(0, side * -0.25, 0), bevel=0.004)
        # Side number plates
        k.panel([(-0.16, 0.66), (-0.52, 0.7), (-0.64, 0.86), (-0.46, 0.95), (-0.14, 0.9)], side * 0.125, 0.02, "plastic", toe=side * 0.08, bevel=0.008)

    # Long flat seat
    k.loft([(0.3, 0.95, 1.0, 0.05), (0.2, 0.93, 1.005, 0.085, 3.4, 3), (0.0, 0.9, 0.965, 0.09, 3.4, 3), (-0.3, 0.89, 0.955, 0.09, 3.4, 3), (-0.52, 0.91, 0.98, 0.085, 3.4, 3), (-0.6, 0.93, 0.99, 0.05)],
           "seat", ring=12, steps=2)

    # Upswept rear mudguard
    def tail(u, v):
        across = (v - 0.5) * 2
        z = -0.4 - 0.6 * u
        return (across * (0.085 - 0.02 * u), 0.9 + 0.15 * u ** 1.3 - 0.03 * across * across, z)

    k.sheet(tail, "paint", nu=8, nv=4, thick=0.012)

    # Perimeter frame in the bike's colour, with a cradle and a subframe
    for side in (-1, 1):
        k.tube([(side * 0.04, 0.98, 0.44), (side * 0.11, 0.84, 0.2), (side * 0.12, 0.62, -0.06), (side * 0.11, 0.42, -0.14)], 0.02, "paint", seg=6, smooth=2)
        k.tube([(side * 0.04, 0.9, 0.42), (side * 0.07, 0.5, 0.34), (side * 0.09, 0.3, 0.2), (side * 0.09, 0.28, -0.04), (side * 0.11, 0.4, -0.14)], 0.016, "paint", seg=6, smooth=2)
        k.rod((side * 0.11, 0.8, -0.04), (side * 0.09, 0.93, -0.62), 0.012, "steel", seg=6)
        k.rod((side * 0.11, 0.5, -0.14), (side * 0.09, 0.9, -0.56), 0.012, "steel", seg=6)
    k.cylinder(0.04, 0.2, (0, 0.96, 0.45), "paint", rot=(-0.3, 0, 0), seg=10)

    # Single-cylinder engine: cases, a finned barrel, the head, a clutch cover
    k.box((0.2, 0.2, 0.3), (0, 0.42, 0.05), "dark_metal", bevel=0.02)
    fins = [(0.06 + (0.016 if n % 2 else 0), 0.02 + 0.014 * n) for n in range(9)]
    k.lathe([(0.05, 0)] + fins + [(0.06, 0.15)], (0, 0.5, 0.11), "steel", rot=(0.22, 0, 0), seg=10, sharp=80)
    k.box((0.15, 0.08, 0.15), (0, 0.7, 0.155), "steel_dark", rot=(0.22, 0, 0), bevel=0.012)
    k.lathe([(0, 0), (0.08, 0), (0.08, 0.02), (0.05, 0.035), (0, 0.035)], (0.1, 0.42, 0.0), "steel", axis="x", seg=12)
    k.loft([(0.34, 0.27, 0.3, 0.07), (0.24, 0.24, 0.29, 0.12, 4, 3), (0.0, 0.24, 0.28, 0.12, 4, 3), (-0.1, 0.26, 0.28, 0.08)], "steel", ring=8, steps=1)

    parts.swingarm(k, pivot=(0.42, -0.14), axle=(0.3, -0.7), x=0.085, size=(0.03, 0.07), brace=True)
    parts.shock(k, (0, 0.82, -0.12), (0, 0.4, -0.3), 0.036)
    parts.chain(k, x=-0.085, front=(0.42, -0.04, 0.04), rear=(0.3, -0.7, 0.125))
    # The rear caliper hangs under the swingarm, a little ahead of the axle, as
    # on a motocross bike: a carrier on the axle holds it and the hose runs
    # forward along the arm's underside to the master cylinder by the peg.
    # Higher up it would sit on the arm's end; past ~305 degrees it cuts the arm.
    rear_caliper = math.radians(290)
    parts.caliper(k, (0.06, 0.3, -0.7), 0.11, rear_caliper)
    held = (0.09, 0.3 + math.sin(rear_caliper) * 0.08, -0.7 + math.cos(rear_caliper) * 0.08)
    k.beam((0.09, 0.3, -0.7), held, (0.01, 0.04), "steel_dark", bevel=0)
    k.tube([(0.078, 0.24, -0.645), (0.08, 0.285, -0.5), (0.08, 0.33, -0.3), (0.15, 0.37, -0.13)], 0.005, "rubber", seg=5, smooth=2)

    # Exhaust: the header loops round the barrel to a silencer high on the right
    k.tube([(0.0, 0.6, 0.2), (0.05, 0.56, 0.32), (0.13, 0.48, 0.3), (0.15, 0.5, 0.05), (0.14, 0.66, -0.2), (0.14, 0.76, -0.34)], 0.024, "steel", seg=7, smooth=3)
    parts.can(k, (0.14, 0.76, -0.34), (0.155, 0.9, -0.78), 0.05, "steel", cap="dark_metal")

    parts.pegs(k, PEG, hanger=(0.5, -0.1), wide=0.07)
    k.side_stand((-0.13, 0.3, -0.02), (-0.27, 0.03, 0.06), 0.01, "steel_dark", seg=6)

    k.finish(OUT, anchors={"grip": GRIP, "peg": PEG}, budget=12000, alone=("wheel_front", "wheel_rear", "disc_front", "disc_rear"))
    parts.preview(k, "dirt")


build()
