# The super sports bike (Steve): full fairing with a bubble screen, humped
# tank, upswept tail, twin-spar frame, braced swingarm, cast twin-spoke
# wheels, inverted forks with twin front discs and a side-mounted can.
#
# Wheel centres, bar, pegs, seat and brake light stand where
# Vehicle.buildSportBike puts them (js/vehicle.js), so the game's animation,
# physics and camera need nothing new.
#   blender --background --factory-startup --python tools/blender/bike_sport.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bike_parts as parts  # noqa: E402
from bike_kit import Kit  # noqa: E402
from common import ASSETS  # noqa: E402

OUT = os.path.join(ASSETS, "bikes", "sport.glb")
# The same bike at a fraction of the detail, for the touring crew's riders
# (js/traffic.js), who are seen from a distance and are several at once
CREW = os.path.join(ASSETS, "bikes", "crew.glb")
FRONT, REAR = (0, 0.3, 0.7), (0, 0.3, -0.7)
# Where the rider's hand and foot go (right side), as buildSportBike poses them
GRIP = (0.19, 1.0, 0.6)
PEG = (0.21, 0.43, -0.13)


def build(low=False):
    k = Kit(seed=11, low=low)

    k.begin("wheel_rear", REAR)
    k.wheel(REAR, 0.30, 0.16, 0.212, style="alloy", spokes=5)
    parts.sprocket(k, REAR, -0.1, 0.105)
    k.begin("wheel_front", FRONT)
    k.wheel(FRONT, 0.28, 0.12, 0.2, style="alloy", spokes=5)
    k.begin("disc_rear", (0.09, 0.3, -0.7))
    k.disc((0.085, 0.3, -0.7), 0.11)
    k.begin("disc_front", (0.09, 0.3, 0.7))
    k.disc((0.072, 0.3, 0.7), 0.15)
    k.disc((-0.072, 0.3, 0.7), 0.15)

    # Inverted forks, raked 15 degrees, with radial calipers
    top = (0.92, 0.534)
    parts.forks(k, x=0.105, axle=(0.3, 0.7), top=top, radius=0.022, usd=True, pivot=(0.1, 0.55, 0.7), caliper_radius=0.15, twin=True)

    k.begin("handlebar", (0, 1.0, 0.6))
    parts.clipons(k, GRIP, inner=(0.1, 0.95, 0.55))

    k.begin("brake_light", (0, 0.99, -0.84))
    k.box((0.12, 0.034, 0.03), (0, 0.992, -0.868), "brake", rot=(0.25, 0, 0), bevel=0.008)

    k.begin("headlight", (-0.07, 0.74, 0.85))
    for side in (-1, 1):
        k.box((0.1, 0.04, 0.06), (side * 0.085, 0.765, 0.892), "headlight", rot=(-0.55, side * 0.5, side * -0.3), bevel=0.012)

    k.begin("body")

    # Fairing: the nose runs over the front wheel, the flanks drop behind it
    # to the belly pan. Painted above, dark below, a stripe of accent between.
    def fairing(u, up, side):
        if up < -0.72:
            return "paint_dark"
        if -0.72 <= up < -0.38 and u > 0.34:
            return "accent"
        return "paint"

    k.loft([
        (0.96, 0.74, 0.80, 0.02),
        (0.93, 0.67, 0.86, 0.105, 2.2, 2.6),
        (0.86, 0.63, 0.905, 0.165, 2.2, 3.0),
        (0.74, 0.62, 0.93, 0.2, 2.3, 3.2),
        (0.6, 0.6, 0.935, 0.215, 2.4, 3.2),
        (0.47, 0.5, 0.915, 0.225, 2.6, 3.0, 0.62),
        (0.4, 0.3, 0.88, 0.225, 2.8, 3.0, 0.68),
        (0.3, 0.21, 0.8, 0.22, 3.0, 3.2, 0.66),
        (0.14, 0.2, 0.7, 0.21, 3.0, 3.2, 0.6),
        (0.0, 0.21, 0.6, 0.195, 3.0, 3.0, 0.55),
        (-0.12, 0.25, 0.5, 0.17, 2.8, 2.8),
        (-0.2, 0.3, 0.44, 0.12, 2.4, 2.4),
    ], fairing, ring=20, steps=3, sharp=50)
    # Ram-air mouth between the lights
    k.box((0.09, 0.045, 0.05), (0, 0.7, 0.93), "vent", rot=(-0.3, 0, 0), bevel=0.012)

    # Bubble screen: its edges sit on the fairing, its crown stands clear of the bars
    def screen(u, v):
        across = (v - 0.5) * 2
        z = 0.885 - 0.32 * u + 0.03 * across * across
        crown = 0.875 + 0.3 * u ** 0.75
        edge = 0.87 + 0.075 * u
        half = 0.07 + 0.13 * math.sin(min(u * 1.25, 1) * math.pi / 2) - 0.03 * u * u
        return (across * half, edge + (crown - edge) * (1 - across * across) ** 0.8, z)

    k.sheet(screen, "glass", nu=7, nv=8, thick=0.006)
    k.box((0.2, 0.05, 0.12), (0, 0.925, 0.7), "dark_metal", rot=(-0.45, 0, 0))
    k.box((0.13, 0.008, 0.075), (0, 0.957, 0.685), "dash", rot=(-0.45, 0, 0), bevel=0)
    parts.mirror(k, (0.17, 0.93, 0.7), (0.32, 1.05, 0.66), mat="paint")

    # Tank: humped, cut in at the knees, with the stripe over its crown
    def tank(u, up, side):
        return "accent" if up > 0.9 else "paint"

    k.loft([
        (0.47, 0.84, 0.9, 0.09),
        (0.4, 0.76, 0.97, 0.17, 2.4, 2.8),
        (0.28, 0.72, 1.02, 0.205, 2.5, 3.0, 0.45),
        (0.14, 0.71, 1.03, 0.205, 2.5, 3.0, 0.45),
        (0.03, 0.72, 0.99, 0.185, 2.5, 3.0, 0.5, 0.8),
        (-0.06, 0.75, 0.93, 0.15, 2.4, 2.8, 0.5, 0.75),
        (-0.11, 0.8, 0.89, 0.09),
    ], tank, ring=20, steps=3)
    k.cylinder(0.036, 0.012, (0, 1.032, 0.2), "chrome", seg=12)

    # Seat and pillion pad
    k.loft([(-0.05, 0.83, 0.895, 0.12), (-0.12, 0.82, 0.9, 0.15, 3, 3), (-0.26, 0.82, 0.895, 0.145, 3, 3), (-0.36, 0.83, 0.905, 0.12, 3, 3), (-0.4, 0.85, 0.92, 0.08)],
           "seat", ring=12, steps=2)
    k.loft([(-0.42, 0.9, 0.975, 0.07), (-0.47, 0.89, 0.995, 0.1, 3, 3), (-0.6, 0.93, 1.03, 0.085, 3, 3), (-0.66, 0.96, 1.045, 0.05)], "seat", ring=12, steps=2)

    # Tail: rises to a blunt tip that carries the brake light
    def tail(u, up, side):
        return "paint_dark" if up < -0.55 else ("accent" if (0.3 < u < 0.75 and -0.55 <= up < -0.1) else "paint")

    k.loft([
        (0.0, 0.68, 0.84, 0.13),
        (-0.14, 0.7, 0.86, 0.16, 3, 2.6),
        (-0.32, 0.74, 0.885, 0.16, 3, 2.6),
        (-0.5, 0.82, 0.965, 0.14, 3, 2.6),
        (-0.68, 0.895, 1.02, 0.11, 3, 2.6),
        (-0.82, 0.94, 1.04, 0.085, 3, 2.6),
        (-0.87, 0.96, 1.035, 0.06),
    ], tail, ring=16, steps=2)
    k.beam((0, 0.9, -0.66), (0, 0.66, -0.93), (0.03, 0.02), "dark_metal")
    k.box((0.16, 0.1, 0.008), (0, 0.67, -0.93), "plate", rot=(0.3, 0, 0), bevel=0)
    for side in (-1, 1):
        k.rod((side * 0.05, 0.78, -0.8), (side * 0.14, 0.79, -0.81), 0.008, "dark_metal", seg=5)
        k.box((0.04, 0.022, 0.03), (side * 0.155, 0.79, -0.81), "signal", bevel=0.008)

    # Twin-spar frame from the headstock to the pivot plates, and a subframe
    for side in (-1, 1):
        k.beam((side * 0.085, 0.84, 0.47), (side * 0.15, 0.56, -0.02), (0.04, 0.11), "steel", bevel=0.012)
        k.panel([(-0.02, 0.62), (-0.16, 0.6), (-0.2, 0.42), (-0.14, 0.34), (-0.06, 0.36), (0.0, 0.48)], side * 0.15, 0.035, "steel", bevel=0.01)
        k.beam((side * 0.12, 0.72, -0.08), (side * 0.1, 0.9, -0.6), (0.022, 0.03), "dark_metal", bevel=0)
    k.cylinder(0.05, 0.2, (0, 0.84, 0.5), "steel", rot=(-0.26, 0, 0), seg=10)

    # Engine: block, inclined bank, covers and sump, seen through the frame
    k.box((0.27, 0.26, 0.42), (0, 0.42, 0.08), "dark_metal", bevel=0.02)
    k.box((0.25, 0.2, 0.22), (0, 0.6, 0.22), "steel_dark", rot=(-0.5, 0, 0), bevel=0.015)
    for side in (-1, 1):
        k.lathe([(0, 0), (0.09, 0), (0.09, 0.02), (0.06, 0.034), (0, 0.034)], (side * 0.135, 0.4, -0.03), "steel", axis="x", rot=(0, 0, 0 if side > 0 else math.pi), seg=14)
    k.box((0.3, 0.2, 0.03), (0, 0.5, 0.42), "vent", rot=(-0.3, 0, 0), bevel=0)

    # Swingarm, shock, chain
    parts.swingarm(k, pivot=(0.42, -0.14), axle=(0.3, -0.7), x=0.1, size=(0.04, 0.085), brace=True)
    parts.shock(k, (0, 0.62, -0.2), (0, 0.38, -0.34), 0.034)
    parts.chain(k, x=-0.1, front=(0.4, -0.06, 0.045), rear=(0.3, -0.7, 0.105))
    parts.caliper(k, (0.085, 0.3, -0.7), 0.11, math.radians(200), "caliper")
    k.guard((0.3, -0.7), 0.325, 0.2, math.radians(48), math.radians(128), "carbon", crown=0.035, nu=8)

    # Front mudguard hugging the tyre
    k.guard((0.3, 0.7), 0.3, 0.15, math.radians(28), math.radians(140), "paint", crown=0.04, nu=10)

    # Exhaust: a header under the engine into an upswept can on the right
    k.tube([(0.07, 0.5, 0.34), (0.11, 0.3, 0.33), (0.13, 0.23, 0.1), (0.15, 0.25, -0.12), (0.17, 0.33, -0.24)], 0.024, "steel", seg=8, smooth=3)
    parts.can(k, (0.175, 0.32, -0.22), (0.205, 0.56, -0.72), 0.058, "chrome")

    # Rearsets and the side stand
    parts.pegs(k, PEG, hanger=(0.5, -0.1), heel=True)
    k.rod((-0.15, 0.3, 0.02), (-0.27, 0.03, 0.1), 0.011, "steel_dark", seg=6)

    if low:
        k.finish(CREW, anchors={"grip": GRIP, "peg": PEG}, budget=2600, alone=("wheel_front", "wheel_rear"),
                 fold=("fork_left", "fork_right", "handlebar", "headlight", "disc_front", "disc_rear"), decimate=0.2)
        parts.preview(k, "crew")
    else:
        k.finish(OUT, anchors={"grip": GRIP, "peg": PEG}, budget=12000, alone=("wheel_front", "wheel_rear", "disc_front", "disc_rear"))
        parts.preview(k, "sport")


build()
build(low=True)
