# Parts the four bikes share, built with the kit: forks, bars, drive, brakes,
# exhaust cans, pegs. Positions are in the game's axes (bike_kit.py).
import math
import os

from mathutils import Vector

from bike_kit import render


def along(a, b, t):
    return tuple(p + (q - p) * t for p, q in zip(a, b))


# A brake caliper gripping a disc of `radius` at `angle` round it, measured
# from straight ahead of the axle up over the top
def caliper(k, centre, radius, angle, mat="caliper"):
    x, y, z = centre
    r = radius * 0.84
    k.box((0.05, 0.058, 0.105), (x, y + math.sin(angle) * r, z + math.cos(angle) * r), mat, rot=(math.pi / 2 - angle, 0, 0), bevel=0.01)


# Both fork legs as their own nodes, with the yokes and the axle in the body.
# `usd` puts the thick tube on top; `caliper` is the disc radius to grip.
def forks(k, x, axle, top, radius, pivot, usd=False, caliper_radius=None, twin=False, disc_x=0.072, lower="steel", gaiters=False, shields=None):
    for side, name in ((-1, "fork_left"), (1, "fork_right")):
        k.begin(name, (side * pivot[0], pivot[1], pivot[2]))
        a = (side * x, axle[0], axle[1])
        b = (side * x, top[0], top[1])
        if usd:
            k.rod(along(a, b, 0.06), along(a, b, 0.5), radius, "chrome")
            k.rod(along(a, b, 0.44), b, radius * 1.42, "fork_gold", seg=12)
        else:
            k.rod(a, along(a, b, 0.52), radius * 1.4, lower, seg=12)
            k.rod(along(a, b, 0.48), b, radius, "chrome")
        if gaiters:
            length = (Vector(b) - Vector(a)).length
            ribs = [(radius * (1.75 if n % 2 else 1.25), length * (0.5 + 0.03 * n)) for n in range(9)]
            k.lathe(ribs, a, "rubber", to=b, seg=10, sharp=80)
        if shields:
            # Off the leg's outer side, so the guard clears the disc inboard of it
            out = Vector((side * radius * 0.7, 0, 0))
            k.rod(tuple(Vector(along(a, b, 0.02)) + out), tuple(Vector(along(a, b, 0.5)) + out), radius * 1.9, shields, seg=8, top=radius * 1.7)
        k.box((radius * 3.2, 0.07, 0.06), a, "steel_dark", bevel=0.012)
        if caliper_radius and (twin or side > 0):
            caliper(k, (side * disc_x, axle[0], axle[1]), caliper_radius, math.radians(205))
    k.begin("body")
    k.rod((-x - 0.02, axle[0], axle[1]), (x + 0.02, axle[0], axle[1]), 0.014, "chrome", seg=8)
    lean = math.atan2(axle[1] - top[1], top[0] - axle[0])
    for t, deep in ((0.98, 0.03), (0.76, 0.036)):
        y, z = axle[0] + (top[0] - axle[0]) * t, axle[1] + (top[1] - axle[1]) * t
        k.box((x * 2 + radius * 4.4, deep, 0.085), (0, y, z - 0.012), "steel_dark", rot=(lean, 0, 0), bevel=0.01)


# Clip-ons: a short bar from each fork top out to the grip
def clipons(k, grip, inner):
    for side in (-1, 1):
        g = Vector((side * grip[0], grip[1], grip[2]))
        root = Vector((side * inner[0], inner[1], inner[2]))
        controls(k, root, g, side)
        k.rod(root, g, 0.011, "chrome", seg=8)
        k.cylinder(0.034, 0.03, root, "dark_metal", seg=10)


# Grip, bar end, lever and perch on a bar that runs from `root` to the grip
def controls(k, root, g, side, guard=None):
    out = (g - root).normalized()
    ahead = Vector((0, -0.25, 1)).normalized()
    k.rod(g - out * 0.06, g + out * 0.06, 0.018, "rubber", seg=10)
    k.rod(g + out * 0.06, g + out * 0.082, 0.021, "dark_metal", seg=10)
    k.box((0.035, 0.03, 0.04), g - out * 0.085 + ahead * 0.012, "dark_metal", bevel=0.006)
    k.rod(g - out * 0.08 + ahead * 0.035, g + out * 0.07 + ahead * 0.06, 0.006, "chrome", seg=5)
    if side > 0:
        k.cylinder(0.017, 0.03, g - out * 0.085 + Vector((0, 0.04, 0.01)), "steel", seg=8)
    if guard:
        k.tube([g - out * 0.1 + ahead * 0.02, g - out * 0.06 + ahead * 0.09, g + out * 0.05 + ahead * 0.085, g + out * 0.085], 0.016, guard, seg=6, smooth=2)


# A one-piece bar: a clamp on the yoke, a rise and a sweep back to the grips
def bars(k, grip, clamp, rise=0.05, radius=0.012, mat="chrome", crossbar=False, guard=None):
    cy, cz = clamp
    for side in (-1, 1):
        g = Vector((side * grip[0], grip[1], grip[2]))
        bend = Vector((side * grip[0] * 0.42, cy + rise, cz))
        k.tube([(0, cy, cz), (side * 0.05, cy, cz), bend, g - Vector((side * 0.07, 0, 0)), g + Vector((side * 0.06, 0, 0))], radius, mat, seg=7, smooth=2)
        controls(k, bend, g, side, guard)
        k.cylinder(0.02, 0.07, (side * 0.045, cy - 0.03, cz), "steel_dark", seg=8)
    if crossbar:
        k.rod((-grip[0] * 0.45, cy + rise * 1.05, cz), (grip[0] * 0.45, cy + rise * 1.05, cz), 0.022, "paint", seg=8)


def mirror(k, root, head, mat="dark_metal", size=(0.055, 0.04)):
    for side in (-1, 1):
        a = (side * root[0], root[1], root[2])
        b = (side * head[0], head[1], head[2])
        k.tube([a, along(a, b, 0.6), b], 0.007, mat, seg=5)
        w, h = size
        k.loft([(b[2] - 0.012, b[1] - h * 0.4, b[1] + h * 0.4, w * 0.4, 2.4, 2.4, 0.5, 1, 1, b[0]), (b[2] - 0.004, b[1] - h, b[1] + h, w, 3, 3, 0.5, 1, 1, b[0]),
                (b[2] + 0.014, b[1] - h * 0.9, b[1] + h * 0.9, w * 0.9, 3, 3, 0.5, 1, 1, b[0]), (b[2] + 0.024, b[1] - h * 0.3, b[1] + h * 0.3, w * 0.3, 2.4, 2.4, 0.5, 1, 1, b[0])],
               mat, ring=8, steps=1)


def sprocket(k, centre, x, radius):
    if k.low:
        return
    k.lathe([(0, -0.005), (radius, -0.005), (radius, 0.005), (0, 0.005)], (centre[0] + x, centre[1], centre[2]), "steel_dark", axis="x", seg=24,
            ripple=lambda i, j: 0.007 if (j in (1, 2) and i % 2) else 0.0, sharp=20)


def swingarm(k, pivot, axle, x, size, mat="steel", brace=False, sides=(-1, 1)):
    for side in sides:
        a = (side * x, pivot[0], pivot[1])
        b = (side * x, axle[0], axle[1])
        k.beam(a, along(a, b, 1.06), size, mat, bevel=0.012)
        k.box((0.02, 0.05, 0.07), (side * (x + 0.012), axle[0], axle[1]), "steel_dark", bevel=0.006)
    if brace:
        mid = along((0, pivot[0], pivot[1]), (0, axle[0], axle[1]), 0.3)
        k.box((x * 2, size[1] * 0.8, 0.09), mid, mat, bevel=0.012)
    k.rod((-x - 0.03, pivot[0], pivot[1]), (x + 0.03, pivot[0], pivot[1]), 0.02, "steel_dark", seg=8)


# A coil-over damper between two eyes
def shock(k, a, b, radius, mat="spring"):
    length = (Vector(b) - Vector(a)).length
    coils = 9
    profile = [(radius * (1.0 if n % 2 else 0.68), length * (0.14 + 0.72 * n / (coils * 2))) for n in range(coils * 2 + 1)]
    k.lathe(profile, a, mat, to=b, seg=10, sharp=80)
    k.rod(a, b, radius * 0.5, "chrome", seg=8)
    k.rod(a, along(a, b, 0.16), radius * 0.9, "steel_dark", seg=8)


# Chain: two runs between the sprockets, `front` and `rear` as (y, z, radius)
def chain(k, x, front, rear):
    for sign in (1, -1):
        k.beam((x, front[0] + sign * front[2], front[1]), (x, rear[0] + sign * rear[2], rear[1]), (0.014, 0.02), "dark_metal", bevel=0)
    k.cylinder(front[2], 0.016, (x, front[0], front[1]), "steel_dark", axis="x", seg=10)


# A silencer from a to b: inlet cone, body, end cap and a strap
def can(k, a, b, radius, mat="chrome", cap="dark_metal"):
    length = (Vector(b) - Vector(a)).length
    k.lathe([(0, 0), (radius * 0.5, 0), (radius, length * 0.14), (radius, length * 0.9), (radius * 0.86, length * 0.97)], a, mat, to=b, seg=14)
    k.lathe([(radius * 0.9, length * 0.955), (radius * 0.9, length), (radius * 0.62, length), (radius * 0.62, length * 0.94), (0, length * 0.94)], a, cap, to=b, seg=14)
    k.lathe([(radius * 1.06, length * 0.5), (radius * 1.06, length * 0.56)], a, cap, to=b, seg=14, solid=0.004)


# Footpegs both sides at `peg` (right side given), hung from a plate
def pegs(k, peg, hanger=None, heel=False, mat="steel", wide=0.05):
    for side in (-1, 1):
        x, y, z = side * peg[0], peg[1], peg[2]
        k.rod((x - side * 0.075, y - 0.012, z), (x + side * wide, y - 0.012, z), 0.013, mat, seg=8)
        if hanger:
            k.beam((x - side * 0.07, hanger[0], hanger[1]), (x - side * 0.07, y - 0.02, z), (0.012, 0.045), "steel_dark", bevel=0.004)
        if heel:
            k.box((0.008, 0.08, 0.1), (x - side * 0.055, y + 0.05, z - 0.07), "carbon", bevel=0)
    # Gear lever on the left, brake pedal on the right
    k.rod((-peg[0] + 0.06, peg[1] - 0.02, peg[2] + 0.02), (-peg[0] + 0.01, peg[1] - 0.03, peg[2] + 0.17), 0.007, "steel_dark", seg=5)
    k.rod((peg[0] - 0.06, peg[1] - 0.02, peg[2] + 0.02), (peg[0] - 0.01, peg[1] - 0.04, peg[2] + 0.16), 0.007, "steel_dark", seg=5)


# With TWISTY_PREVIEW set to a directory, renders the finished model there
def preview(k, name):
    out = os.environ.get("TWISTY_PREVIEW")
    if not out:
        return
    views = {"side": ((4.6, 0.8, 0.0), (0, 0.62, 0.0)), "front": ((2.4, 1.5, 3.4), (0, 0.55, 0.0)), "rear": ((-2.4, 1.5, -3.4), (0, 0.55, 0.0))}
    for view, (eye, target) in views.items():
        render(k.scene, os.path.join(out, f"{name}-{view}.png"), eye, target, lens=62)
