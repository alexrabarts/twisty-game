# The adventure bike (Alex): tall and upright, a beak over a big wire-spoked
# front wheel, a boxer twin behind crash bars, a tall screen, a stepped seat
# and alloy luggage: two panniers and a top box that carries the brake light.
#
# Wheel centres, bar, pegs, seat and brake light stand where
# Vehicle.buildAdventureBike puts them (js/vehicle.js).
#   blender --background --factory-startup --python tools/blender/bike_adventure.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bike_parts as parts  # noqa: E402
from bike_kit import Kit  # noqa: E402
from common import ASSETS  # noqa: E402

OUT = os.path.join(ASSETS, "bikes", "adventure.glb")
FRONT, REAR = (0, 0.3, 0.7), (0, 0.3, -0.7)
GRIP = (0.24, 1.19, 0.48)
PEG = (0.2, 0.48, -0.06)


def build():
    k = Kit(seed=12, colours={"paint": 0xC9A227, "paint_dark": 0x3C300B, "accent": 0x2B2F38, "caliper": 0x2255AA, "rim": 0xC8CACC})

    k.begin("wheel_rear", REAR)
    k.wheel(REAR, 0.30, 0.13, 0.21, style="wire", tread="knobby")
    k.begin("wheel_front", FRONT)
    k.wheel(FRONT, 0.30, 0.1, 0.235, style="wire", tread="knobby")
    k.begin("disc_rear", (0.09, 0.3, -0.7))
    k.disc((0.075, 0.3, -0.7), 0.12)
    k.begin("disc_front", (0.09, 0.3, 0.7))
    k.disc((0.062, 0.3, 0.7), 0.15)
    k.disc((-0.062, 0.3, 0.7), 0.15)

    # Long-travel forks under rubber gaiters
    parts.forks(k, x=0.095, axle=(0.3, 0.7), top=(1.0, 0.5), radius=0.021, pivot=(0.09, 0.58, 0.68), caliper_radius=0.15, twin=True, disc_x=0.062, gaiters=True)

    k.begin("handlebar", (0, 1.18, 0.5))
    parts.bars(k, GRIP, clamp=(1.1, 0.47), rise=0.07, guard="paint")
    parts.mirror(k, (0.15, 1.17, 0.47), (0.31, 1.37, 0.43))

    k.begin("brake_light", (0, 1.12, -0.79))
    k.box((0.2, 0.05, 0.02), (0, 1.12, -0.772), "brake", bevel=0.006)

    k.begin("headlight", (-0.06, 0.95, 0.58))
    for side in (-1, 1):
        k.lathe([(0, 0), (0.045, 0), (0.05, 0.012), (0.04, 0.03), (0, 0.036)], (side * 0.058, 0.955, 0.665), "headlight", axis="z", seg=12)

    k.begin("body")

    # Nose: the headlight shell and the beak that runs out over the wheel
    k.loft([(0.69, 0.9, 1.0, 0.09), (0.66, 0.85, 1.05, 0.15, 3, 3), (0.56, 0.8, 1.1, 0.2, 3, 3), (0.44, 0.8, 1.1, 0.2, 3, 3), (0.36, 0.84, 1.06, 0.16)],
           "accent", ring=14, steps=2)
    k.loft([(0.52, 0.72, 0.86, 0.12), (0.66, 0.73, 0.83, 0.11, 2.4, 4), (0.84, 0.71, 0.77, 0.08, 2.4, 4), (0.98, 0.685, 0.715, 0.045, 2.4, 4), (1.02, 0.68, 0.695, 0.02)],
           "paint", ring=12, steps=2)
    k.guard((0.3, 0.7), 0.325, 0.12, math.radians(42), math.radians(150), "accent", crown=0.03, nu=8)

    # Tall touring screen and the dash behind it
    def screen(u, v):
        across = (v - 0.5) * 2
        half = 0.175 - 0.045 * u
        return (across * half, 1.07 + 0.43 * u, 0.63 - 0.24 * u ** 1.3 - 0.07 * across * across)

    k.sheet(screen, "glass", nu=5, nv=6, thick=0.006)
    k.box((0.2, 0.11, 0.03), (0, 1.14, 0.5), "dark_metal", rot=(-0.45, 0, 0))
    k.box((0.16, 0.08, 0.008), (0, 1.146, 0.485), "dash", rot=(-0.45, 0, 0), bevel=0)

    # Tank: tall, broad-shouldered, a dark band along its flanks
    def tank(u, up, side):
        return "accent" if (0.18 < u < 0.86 and -0.62 < up < -0.2) else "paint"

    k.loft([
        (0.47, 0.84, 1.04, 0.12),
        (0.41, 0.76, 1.1, 0.2, 3.0, 3.0),
        (0.28, 0.7, 1.13, 0.225, 3.2, 3.0, 0.45),
        (0.14, 0.7, 1.115, 0.21, 3.2, 3.0, 0.45),
        (0.04, 0.72, 1.06, 0.175, 3.0, 3.0, 0.5, 0.85),
        (-0.04, 0.76, 1.0, 0.13),
    ], tank, ring=18, steps=3)
    k.cylinder(0.035, 0.012, (0, 1.132, 0.24), "steel", seg=12)

    # Stepped seat
    k.loft([(-0.0, 0.9, 0.97, 0.1), (-0.07, 0.88, 0.985, 0.15, 3, 3), (-0.24, 0.88, 0.98, 0.16, 3, 3), (-0.36, 0.9, 0.995, 0.15, 3, 3), (-0.4, 0.92, 1.01, 0.12)],
           "seat", ring=12, steps=2)
    k.loft([(-0.4, 0.94, 1.02, 0.11), (-0.45, 0.93, 1.045, 0.15, 3, 3), (-0.62, 0.94, 1.05, 0.15, 3, 3), (-0.7, 0.96, 1.04, 0.1)], "pillion", ring=12, steps=2)

    # Side panels under the seat and the tail
    k.loft([(0.02, 0.74, 0.9, 0.14), (-0.2, 0.76, 0.9, 0.15, 3, 3), (-0.45, 0.82, 0.95, 0.14, 3, 3), (-0.7, 0.88, 0.97, 0.12, 3, 3), (-0.84, 0.92, 0.97, 0.07)],
           "accent", ring=12, steps=2)
    k.guard((0.3, -0.7), 0.335, 0.15, math.radians(70), math.radians(165), "accent", crown=0.03, nu=8)
    k.box((0.16, 0.1, 0.008), (0, 0.6, -0.985), "plate", rot=(0.2, 0, 0), bevel=0)

    # Luggage: a rack, a top box with a painted lid and a pannier each side
    k.box((0.3, 0.02, 0.36), (0, 1.0, -0.6), "steel_dark", bevel=0.006)
    k.box((0.36, 0.25, 0.32), (0, 1.135, -0.6), "luggage", bevel=0.03)
    k.box((0.38, 0.05, 0.34), (0, 1.285, -0.6), "paint", bevel=0.02)
    k.box((0.1, 0.02, 0.02), (0, 1.25, -0.435), "steel", bevel=0.004)
    for side in (-1, 1):
        k.box((0.15, 0.34, 0.44), (side * 0.265, 0.74, -0.46), "luggage", bevel=0.03)
        k.box((0.156, 0.012, 0.446), (side * 0.265, 0.84, -0.46), "dark_metal", bevel=0)
        k.box((0.02, 0.05, 0.04), (side * 0.345, 0.79, -0.46), "steel", bevel=0.004)
        k.box((0.008, 0.03, 0.07), (side * 0.342, 0.64, -0.62), "reflector", bevel=0)
        k.rod((side * 0.17, 0.99, -0.42), (side * 0.17, 0.99, -0.78), 0.011, "steel", seg=6)
        k.beam((side * 0.13, 0.9, -0.3), (side * 0.2, 0.74, -0.5), (0.02, 0.02), "steel_dark", bevel=0)

    # Frame and subframe
    for side in (-1, 1):
        k.tube([(side * 0.06, 0.98, 0.46), (side * 0.13, 0.8, 0.2), (side * 0.14, 0.56, -0.08), (side * 0.12, 0.42, -0.14)], 0.02, "steel_dark", seg=6, smooth=2)
        k.rod((side * 0.12, 0.74, -0.02), (side * 0.11, 0.94, -0.62), 0.014, "steel_dark", seg=6)
    k.cylinder(0.045, 0.2, (0, 0.96, 0.48), "steel_dark", rot=(-0.28, 0, 0), seg=10)

    # Boxer twin: a block with a finned cylinder out each side, under a bash plate
    k.box((0.26, 0.3, 0.42), (0, 0.5, 0.1), "dark_metal", bevel=0.02)
    for side in (-1, 1):
        fins = [(0.062 + (0.016 if n % 2 else 0), 0.13 + 0.02 * n) for n in range(7)]
        k.lathe([(0.05, 0.1)] + fins + [(0.07, 0.27), (0.07, 0.3), (0.045, 0.32), (0, 0.32)], (0, 0.47, 0.25), "steel", axis="x",
                rot=(0, 0, 0 if side > 0 else math.pi), seg=10, sharp=80)
        k.tube([(side * 0.1, 0.78, 0.44), (side * 0.3, 0.66, 0.42), (side * 0.36, 0.48, 0.34), (side * 0.3, 0.36, 0.16), (side * 0.13, 0.33, 0.06)], 0.012, "steel", seg=6, smooth=3)
        k.lathe([(0, 0), (0.036, 0), (0.042, 0.03), (0.036, 0.05), (0, 0.055)], (side * 0.29, 0.69, 0.42), "dark_metal", axis="z", seg=10)
        k.cylinder(0.03, 0.006, (side * 0.29, 0.69, 0.477), "headlight", axis="z", seg=10)
    k.loft([(0.46, 0.33, 0.4, 0.1), (0.36, 0.24, 0.36, 0.16, 4, 3), (0.1, 0.215, 0.3, 0.17, 4, 3), (-0.12, 0.24, 0.3, 0.14)], "steel", ring=10, steps=2)

    # Shaft drive on the left, a plain arm on the right, the shock between
    parts.swingarm(k, pivot=(0.42, -0.14), axle=(0.3, -0.7), x=0.105, size=(0.04, 0.07), sides=(1,))
    k.rod((-0.105, 0.42, -0.12), (-0.105, 0.3, -0.7), 0.045, "steel", seg=10, top=0.05)
    k.lathe([(0, 0), (0.07, 0), (0.07, 0.05), (0.04, 0.07), (0, 0.07)], (-0.075, 0.3, -0.7), "steel", axis="x", rot=(0, 0, math.pi), seg=12)
    parts.shock(k, (0.02, 0.72, -0.2), (0.02, 0.4, -0.36), 0.034)
    parts.caliper(k, (0.075, 0.3, -0.7), 0.12, math.radians(200))

    # Exhaust: headers from both cylinders into a can under the right pannier
    k.tube([(0.2, 0.42, 0.3), (0.19, 0.3, 0.2), (0.16, 0.27, -0.05), (0.17, 0.36, -0.2)], 0.022, "steel", seg=7, smooth=3)
    k.tube([(-0.2, 0.42, 0.3), (-0.17, 0.28, 0.16), (0.0, 0.25, -0.04), (0.13, 0.33, -0.2)], 0.02, "steel", seg=7, smooth=3)
    parts.can(k, (0.17, 0.36, -0.2), (0.215, 0.5, -0.78), 0.062, "steel", cap="dark_metal")

    parts.pegs(k, PEG, hanger=(0.56, -0.1), wide=0.06)
    k.rod((-0.15, 0.32, 0.0), (-0.29, 0.03, 0.08), 0.011, "steel_dark", seg=6)

    k.finish(OUT, anchors={"grip": GRIP, "peg": PEG}, budget=12000, alone=("wheel_front", "wheel_rear", "disc_front", "disc_rear"))
    parts.preview(k, "adventure")


build()
