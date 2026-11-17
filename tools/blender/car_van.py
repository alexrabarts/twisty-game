# The traffic van: a compact panel van, 4.34 m long, 1.84 m wide and 1.87 m
# high, on the same wheels and axles as the hatchback so the game drives both
# alike (js/traffic.js). Glass at the cab only; the load bay is plain panel.
#   blender --background --factory-startup --python tools/blender/car_van.py
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from car_kit import HUB, Body, CarKit, preview  # noqa: E402
from common import ASSETS  # noqa: E402

OUT = os.path.join(ASSETS, "cars", "van.glb")
AXLE, TRACK = 1.35, 0.76

TOP = [(-2.13, 1.74), (-2.1, 1.8), (-2.0, 1.835), (-0.2, 1.85), (0.55, 1.825), (0.72, 1.76), (1.28, 1.12), (1.32, 1.1), (1.9, 0.99), (2.06, 0.89), (2.12, 0.77),
       (2.15, 0.67)]
BELT = [(-2.2, 1.1), (0.6, 1.1), (1.25, 1.05), (2.2, 1.0)]
LO = [(-2.13, 0.36), (-2.1, 0.3), (-2.0, 0.24), (-1.8, 0.21), (1.85, 0.21), (2.06, 0.23), (2.12, 0.27), (2.15, 0.33)]
WIDTH = [(-2.13, 0.8), (-2.1, 0.87), (-2.0, 0.91), (-1.7, 0.92), (1.5, 0.92), (1.9, 0.89), (2.06, 0.82), (2.12, 0.71), (2.15, 0.58)]
# The cab door's glass, the screen, and where the unpainted bumpers end
GLASS = (0.02, 1.2)
SCREEN = (0.72, 1.28)
BUMPER = (-1.9, 1.78)


def finish(z, row):
    if row < 2:
        return "vent"
    if row == 2 or (row == 3 and not BUMPER[0] < z < BUMPER[1]):
        return "trim"
    if row < 6:
        return "paint"
    if row == 6:
        return "glass" if GLASS[0] < z < GLASS[1] else "paint"
    if row > 7 and SCREEN[0] < z < SCREEN[1]:
        return "glass"
    return "paint"


def build():
    k = CarKit(seed=37, colours={"paint": 0xF5F5F5, "rim": 0x8E9298})

    k.begin("wheel", (TRACK, HUB, AXLE))
    k.road_wheel((TRACK, HUB, AXLE), spokes=8, gap=0.04)

    body = Body(k, TOP, BELT, LO, WIDTH, roof=1.85, roof_half=0.77, arches=[(-AXLE, 0.4), (AXLE, 0.4)], also=(GLASS[0], -0.55, 0.3))
    tail = body.stations[0]

    k.begin("body")
    body.shell(finish)
    # Shut lines: the cab door, and the sliding door with its rail
    for z in (0.945, 0.0, -0.9):
        body.patch(z - 0.005, z + 0.005, 2.3, 6.9 if z < 0.5 else 6.0, "vent", lift=-0.004)
    body.patch(1.33, 1.345, 7.6, 10.0, "vent", lift=-0.004)
    for side in (-1, 1):
        k.box((0.016, 0.03, 1.0), body.point(-1.42, 5.75, side, 0.004), "trim", bevel=0)
        k.box((0.024, 0.026, 0.13), body.point(0.12, 5.4, side, 0.006), "trim", bevel=0.006)
        k.box((0.024, 0.026, 0.13), body.point(-0.12, 5.4, side, 0.006), "trim", bevel=0.006)
        # Rubbing strip between the arches
        k.box((0.02, 0.07, 1.8), body.point(0.0, 3.7, side, 0.004), "trim", bevel=0.006)
    # Mirrors: tall ones on arms
    for side in (-1, 1):
        root = body.point(1.02, 6.0, side)
        k.beam(root, root + Vector((side * 0.07, 0.05, -0.01)), (0.03, 0.03), "trim", bevel=0)
        x = root.x + side * 0.1
        k.loft([(0.94, 1.1, 1.26, 0.04, 2.6, 2.6, 0.5, 1, 1, x), (0.97, 1.07, 1.31, 0.05, 3, 3, 0.5, 1, 1, x), (1.02, 1.07, 1.31, 0.05, 3, 3, 0.5, 1, 1, x),
                (1.06, 1.1, 1.27, 0.035, 2.6, 2.6, 0.5, 1, 1, x)], "trim", ring=8, steps=1)
    # Roof ribs
    for x in (-0.42, -0.14, 0.14, 0.42):
        k.box((0.09, 0.016, 2.3), (x, 1.862, -0.85), "paint", bevel=0.006)
    # The nose: a grille bar between the lamps, the intake and the plate
    body.patch(2.06, 2.12, 8.3, 10.0, "vent")
    body.plate(1, (0, 0.42), (0.9, 0.12), "vent")
    body.plate(1, (0, 0.56), (0.4, 0.1), "plate")
    # The tail: two doors with a window each, their handle, the plate and a step
    body.plate(-1, (0, 1.05), (0.012, 1.3), "vent", out=-0.004)
    for side in (-1, 1):
        body.plate(-1, (side * 0.36, 1.38), (0.56, 0.42), "glass")
    body.plate(-1, (-0.07, 0.98), (0.1, 0.03), "trim")
    body.plate(-1, (0.3, 0.7), (0.44, 0.11), "plate")
    k.box((1.5, 0.06, 0.07), (0, 0.42, tail - 0.01), "trim", bevel=0.01)

    k.begin("headlights")
    body.patch(1.92, 2.12, 4.7, 6.9, "headlight")
    # Tall clusters up the rear corners
    k.begin("taillights")
    body.patch(-2.1, -1.98, 4.75, 5.9, "taillight")
    for name, side in (("indicator_fl", 1), ("indicator_fr", -1)):
        k.begin(name, tuple(body.point(1.87, 5.8, side)))
        body.patch(1.82, 1.92, 5.0, 6.7, "indicator", sides=(side,))
    # The rear pair are the brake lamps too
    for name, side in (("indicator_rl", 1), ("indicator_rr", -1)):
        k.begin(name, tuple(body.point(-2.1, 6.1, side)))
        body.patch(-2.13, -1.98, 5.9, 6.3, "brake", sides=(side,))

    k.finish(OUT, budget=4500, alone=("wheel",))
    preview(k, "van", height=0.95)


build()
