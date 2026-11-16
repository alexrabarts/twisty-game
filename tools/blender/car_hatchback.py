# The traffic hatchback: a five-door family car, 4.3 m long, 1.8 m wide and
# 1.5 m high, on the wheels Car.createCarModel has (js/traffic.js): 0.32 m
# tyres, 0.76 m out, 1.35 m ahead of and behind the middle. The roof is its
# own finish so the game's two-tone cars keep their second colour.
#   blender --background --factory-startup --python tools/blender/car_hatchback.py
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from car_kit import HUB, Body, CarKit, preview  # noqa: E402
from common import ASSETS  # noqa: E402

OUT = os.path.join(ASSETS, "cars", "hatchback.glb")
AXLE, TRACK = 1.35, 0.76

TOP = [(-2.12, 0.95), (-2.08, 1.03), (-1.98, 1.09), (-1.94, 1.11), (-1.6, 1.44), (-1.3, 1.465), (-0.3, 1.475), (0.22, 1.445), (1.02, 0.985), (1.06, 0.975),
       (1.8, 0.87), (2.04, 0.78), (2.11, 0.68), (2.14, 0.6)]
BELT = [(-2.2, 0.99), (-1.4, 0.975), (0.95, 0.905), (2.2, 0.88)]
LO = [(-2.12, 0.36), (-2.08, 0.28), (-1.98, 0.23), (-1.8, 0.2), (-0.9, 0.18), (0.9, 0.18), (1.85, 0.19), (2.04, 0.21), (2.11, 0.25), (2.14, 0.3)]
WIDTH = [(-2.12, 0.66), (-2.08, 0.8), (-1.98, 0.872), (-1.75, 0.895), (-1.0, 0.9), (0.9, 0.9), (1.6, 0.89), (1.9, 0.868), (2.04, 0.81), (2.11, 0.7), (2.14, 0.56)]
# Where the side glass starts and ends, with the pillar between the doors
GLASS = (-1.46, 0.95)
PILLAR = (-0.3, -0.2)
SCREEN = (0.22, 1.02)
REAR_SCREEN = (-1.94, -1.6)


def finish(z, row):
    if row < 2:
        return "vent"
    if row == 2:
        return "trim"
    if row < 6:
        return "paint"
    front = SCREEN[0] < z < SCREEN[1]
    rear = REAR_SCREEN[0] < z < REAR_SCREEN[1]
    cabin = REAR_SCREEN[1] < z < SCREEN[0]
    if row == 6:
        if PILLAR[0] < z < PILLAR[1]:
            return "trim"
        return "glass" if GLASS[0] < z < GLASS[1] else "paint"
    if row == 7:
        return "paint_roof" if cabin or front else "paint"
    if front or rear:
        return "glass"
    return "paint_roof" if cabin else "paint"


def build():
    k = CarKit(seed=31, colours={"paint": 0x1A3A6B, "paint_roof": 0x1A3A6B, "rim": 0xB0B3B8})

    k.begin("wheel", (TRACK, HUB, AXLE))
    k.road_wheel((TRACK, HUB, AXLE))

    body = Body(k, TOP, BELT, LO, WIDTH, roof=1.475, roof_half=0.64, arches=[(-AXLE, 0.395), (AXLE, 0.395)],
                also=(GLASS[0], PILLAR[0], PILLAR[1], GLASS[1], 0.6, -0.8))
    nose, tail = body.stations[-1], body.stations[0]

    k.begin("body")
    body.shell(finish)
    # Shut lines of the doors, and the bonnet's rear edge
    for z in (0.945, -0.25, -0.945):
        body.patch(z - 0.005, z + 0.005, 2.3, 6.0, "vent", lift=-0.004, thick=0.012)
    body.patch(1.03, 1.045, 7.6, 10.0, "vent", lift=-0.004)
    # Door handles
    for z in (-0.02, -0.72):
        for side in (-1, 1):
            k.box((0.024, 0.026, 0.13), body.point(z, 5.25, side, 0.006), "chrome", bevel=0.006)
    # Mirrors on the front doors
    for side in (-1, 1):
        root = body.point(0.84, 6.0, side)
        k.beam(root, root + Vector((side * 0.07, 0.03, -0.01)), (0.03, 0.03), "trim", bevel=0)
        k.loft([(0.76, 0.975, 1.045, 0.05, 2.6, 2.6, 0.5, 1, 1, root.x + side * 0.1), (0.79, 0.955, 1.075, 0.065, 3, 3, 0.5, 1, 1, root.x + side * 0.1),
                (0.84, 0.955, 1.075, 0.065, 3, 3, 0.5, 1, 1, root.x + side * 0.1), (0.88, 0.975, 1.05, 0.045, 2.6, 2.6, 0.5, 1, 1, root.x + side * 0.1)], "paint", ring=8, steps=1)
    # The nose: grille slot between the lamps, the lower intake and the plate
    body.patch(2.04, 2.11, 8.35, 10.0, "vent")
    body.plate(1, (0, 0.375), (0.86, 0.11), "vent")
    for x in (-0.3, 0.0, 0.3):
        body.plate(1, (x, 0.375), (0.012, 0.11), "trim", out=0.012)
    body.plate(1, (0, 0.5), (0.4, 0.1), "plate")
    # The tail: plate, a dark valance and the exhaust
    body.plate(-1, (0, 0.68), (0.44, 0.11), "plate")
    body.plate(-1, (0, 0.44), (1.0, 0.1), "trim")
    k.cylinder(0.04, 0.1, (0.42, 0.33, tail + 0.03), "chrome", axis="z", seg=8)
    body.patch(-1.62, -1.56, 8.0, 10.0, "trim", lift=0.012)
    # Shark fin
    k.loft([(-1.36, 1.48, 1.5, 0.012), (-1.28, 1.48, 1.55, 0.022), (-1.16, 1.48, 1.5, 0.012)], "trim", ring=6, steps=1)

    # Lamps wrap the corners; each is lit by the game
    k.begin("headlights")
    body.patch(1.9, 2.11, 4.75, 6.9, "headlight")
    k.begin("taillights")
    body.patch(-2.08, -1.88, 4.7, 6.75, "taillight")
    for name, side in (("indicator_fl", 1), ("indicator_fr", -1)):
        k.begin(name, tuple(body.point(1.85, 5.8, side)))
        body.patch(1.8, 1.9, 5.0, 6.7, "indicator", sides=(side,))
    # The rear pair are the brake lamps too: on the tail, where they face back
    for name, side in (("indicator_rl", 1), ("indicator_rr", -1)):
        k.begin(name, (side * 0.47, 0.86, tail))
        body.plate(-1, (side * 0.47, 0.86), (0.3, 0.12), "brake")

    k.finish(OUT, budget=4500, alone=("wheel",))
    preview(k, "hatchback")


build()
