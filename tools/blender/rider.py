# The rider, as rigid segments the game poses itself (js/bikemodels.js): a
# jacketed torso, a full-face helmet with a visor, shaped arms and legs with
# armour at the elbows and knees, gloved fists and boots. Every node is
# modelled about its own origin:
#   torso        upright along y, centred where Vehicle.buildVariantRider
#                centres its torso; the game leans it
#   helmet       about the head's centre, facing +z; peak is the off-road
#                peak that goes with it, hump the racing back hump of the torso
#   backpack, neck
#                about the torso's origin like the hump: a daypack worn on the
#                back, and a neck tube under the helmet
#   upper_arm, forearm, thigh, shin
#                along y from the near joint (-y) to the far one (+y), LENGTHS
#                long, with +z the outside of the bend (elbow, kneecap); the
#                game stretches them to the joints of each bike's pose
#   glove        a fist about the grip, knuckles toward +z
#   boot         about the point of the sole on the peg, toe toward +z
#   <part>_<style>
#                the same part in another cut, for an outfit that names the
#                style (CHARACTERS[].outfits in js/vehicle.js): helmet shells,
#                jackets with their sleeves, trousers, gloves and boots. The
#                plain names are the cut of a part an outfit names no style
#                for, and stay light.
#   back_<style> about the torso's origin: a mark on the back of a jacket, for
#                a kit that names it (backStyle)
#
# +x is the rider's left. One mesh serves both arms and both legs, so a mark
# on the side of a limb is drawn on both of its sides: each limb then shows it
# on the outside.
#
# Material names are the contract with the game, which gives each an outfit's
# colour: suit, suit_accent, suit_trim, suit_patch (a jacket's base, its
# panels, its second colour, and its patches and reflective bars), pants,
# pants_accent (marks on the thigh), pants_trim (lines on the shin), glove,
# glove_accent, boot, boot_accent, helmet, helmet_accent, helmet_trim, visor,
# visor_accent (the lower band of a mirrored visor), neck and backpack. sole
# is always dark. js/bikemodels.js gives a colour an outfit leaves out the
# colour that part had before it was a material of its own.
#   blender --background --factory-startup --python tools/blender/rider.py
# With TWISTY_PREVIEW set to a directory, every outfit of every character is
# rendered there, seated, from the front, the side and the rear.
import json
import math
import os
import subprocess
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
from bike_kit import B, Kit, render, rgb, spline  # noqa: E402
from common import ASSETS, ROOT  # noqa: E402
import far  # noqa: E402

OUT = os.path.join(ASSETS, "bikes", "rider.glb")
# Joint to joint, as modelled; js/bikemodels.js scales each to the pose
LENGTHS = {"upper_arm": 0.31, "forearm": 0.3, "thigh": 0.42, "shin": 0.42}
# A seated rider at most: each part in its heaviest cut, both of each limb and
# every optional part. An outfit as worn is about 5000. Only the rider the
# player rides as wears it on a ride: the crew wear the light rider (far.py).
BUDGET = 7000
# The file holds every cut of every outfit and is fetched once for them all;
# with the light rider's file (far.py) it stays under the 800 KB tests/unit/bikemodels.test.js allows the two
FILE = 624 * 1024
# Positions are whole units of this many metres (bike_kit.pack_colours)
UNIT = 0.0005
DEFAULTS = (2.4, 2.4, 0.5, 1.0, 1.0, 0.0)


# The surface Kit.loft skins over `sections` along y, to lay marks on it and
# to pick its faces by where they are. `span` (start, length) makes the places
# along it fractions of a limb, joint to joint.
class Skin:
    def __init__(self, sections, steps, span=None):
        self.rows = spline([tuple(s) + DEFAULTS[len(s) - 4:] for s in sections], steps)
        self.span = span

    def y(self, s):
        return s if self.span is None else self.span[0] + s * self.span[1]

    def row(self, y):
        rows = self.rows
        y = min(max(y, rows[0][0]), rows[-1][0])
        i = next(n for n in range(1, len(rows)) if rows[n][0] >= y)
        a, b = rows[i - 1], rows[i]
        f = (y - a[0]) / (b[0] - a[0]) if b[0] > a[0] else 0.0
        return [p + (q - p) * f for p, q in zip(a, b)]

    def half(self, s):
        return max(self.row(self.y(s))[3], 0.02)

    # The point at `s` and `degrees` round the axis (0 the rider's left, 90
    # straight ahead), the way Kit.loft places its vertices, `lift` off the surface
    def at(self, s, degrees, lift=0.0):
        y, lo, hi, w, nt, nb, mid, wt, wb, c = self.row(self.y(s))
        centre = lo + (hi - lo) * mid
        t = math.radians(degrees)
        cs, sn = math.cos(t), math.sin(t)
        n, h, narrow = (nt, hi - centre, wt) if sn >= 0 else (nb, centre - lo, wb)
        px = math.copysign(abs(cs) ** (2 / n), cs)
        py = math.copysign(abs(sn) ** (2 / n), sn)
        x = w * px * (1 - (1 - narrow) * abs(py))
        z = centre + h * py
        out = math.hypot(x, z - centre) or 1.0
        return (c + x + x / out * lift, y, z + (z - centre) / out * lift)

    # A material function for Kit.loft from fn(s, up, side): the place of a
    # face along the axis, not its row number
    def zones(self, fn):
        rows = self.rows
        last = len(rows) - 1
        back = (lambda y: y) if self.span is None else (lambda y: (y - self.span[0]) / self.span[1])

        def pick(u, up, side):
            if u <= 0.0 or u >= 1.0:
                return fn(back(rows[0 if u <= 0.0 else last][0]), up, side)
            i = min(last - 1, int(u * last))
            return fn(back((rows[i][0] + rows[i + 1][0]) / 2), up, side)
        return pick


# Turns a one-sided mark to face the way `out` points
def face(obj, out):
    if obj.data.polygons[0].normal.dot(B(out)) < 0:
        obj.data.flip_normals()


# A strip laid on a skin along `path`, (degrees, s) points, `width` metres
# wide: piping, a reflective bar, a patch. A point may carry a width of its
# own, (degrees, s, width), for a blade that runs from a tip to a broad end.
# It is one-sided, which halves its triangles; `thick` makes it a raised panel
# with edges instead. `both` draws it on the rider's right as well, `across`
# splits its width for a wide strip on a curved shell, `step` is the most
# degrees round the axis one piece of it covers.
def decal(k, skin, path, width, mat, lift=0.003, both=False, thick=0.0, across=1, step=10):
    for side in ((1, -1) if both else (1,)):
        points = [(p[0] if side > 0 else 180 - p[0], p[1], p[2] if len(p) > 2 else width) for p in path]
        line = []
        for (d0, s0, w0), (d1, s1, w1) in zip(points, points[1:]):
            n = max(1, math.ceil(max(abs(d1 - d0) / step, abs(skin.y(s1) - skin.y(s0)) / 0.035)))
            line += [(d0 + (d1 - d0) * i / n, s0 + (s1 - s0) * i / n, w0 + (w1 - w0) * i / n) for i in range(n)]
        line.append(points[-1])
        unit = 1.0 if skin.span is None else skin.span[1]
        verts = []
        for i, (d, s, wide) in enumerate(line):
            a, b = line[max(i - 1, 0)], line[min(i + 1, len(line) - 1)]
            r = skin.half(s)
            tx, ty = math.radians(b[0] - a[0]) * r, (b[1] - a[1]) * unit
            n = math.hypot(tx, ty) or 1.0
            nx, ny = -ty / n, tx / n
            for j in range(across + 1):
                e = (j / across - 0.5) * wide
                verts.append(skin.at(s + ny * e / unit, d + math.degrees(nx * e / r), lift))
        row = across + 1
        faces = [(i * row + j, i * row + j + 1, (i + 1) * row + j + 1, (i + 1) * row + j) for i in range(len(line) - 1) for j in range(across)]
        obj = k.emit(verts, faces, mat, sharp=80, solid=thick, weld=False)
        if not thick:
            d, s = line[0][:2]
            face(obj, Vector(skin.at(s, d, 0.01)) - Vector(skin.at(s, d)))


# A flat badge on a skin about (degrees, s), its `outline` in metres across and up
def badge(k, skin, degrees, s, outline, mat, lift=0.004, both=False):
    unit = 1.0 if skin.span is None else skin.span[1]
    for side in ((1, -1) if both else (1,)):
        d = degrees if side > 0 else 180 - degrees
        r = skin.half(s)
        verts = [skin.at(s, d, lift)] + [skin.at(s + b / unit, d + math.degrees(a / r), lift) for a, b in outline]
        count = len(outline)
        obj = k.emit(verts, [(0, 1 + i, 1 + (i + 1) % count) for i in range(count)], mat, sharp=80, weld=False)
        face(obj, Vector(skin.at(s, d, 0.01)) - Vector(skin.at(s, d)))


def star(radius):
    return [(math.sin(i * math.pi / 5) * radius * (1 if i % 2 == 0 else 0.42), math.cos(i * math.pi / 5) * radius * (1 if i % 2 == 0 else 0.42)) for i in range(10)]


def shield(size):
    return [(-size, size), (size, size), (size, -size * 0.3), (0, -size * 1.2), (-size, -size * 0.3)]


def limb_sections(name, rows):
    length = LENGTHS[name]
    first, last = rows[0][1], rows[-1][1]
    sections = [(-length / 2 - first * 0.85, -first * 0.3, first * 0.3, first * 0.3), (-length / 2 - first * 0.5, -first * 0.8, first * 0.8, first * 0.8)]
    for t, radius, bulge, *rest in rows:
        back = rest[0] if rest else 0.0
        sections.append((-length / 2 + t * length, -radius - back, radius + bulge, radius, 2.2, 2.2, (radius + back) / (2 * radius + bulge + back)))
    return sections + [(length / 2 + last * 0.5, -last * 0.8, last * 0.8, last * 0.8), (length / 2 + last * 0.85, -last * 0.3, last * 0.3, last * 0.3)]


# A limb along y: (t, radius, bulge) rows from the near joint (t = 0) to the
# far one (t = 1), closed by a ball at each end. bulge pushes the +z side out
# (the elbow, the kneecap, the top of the thigh), and a fourth number the -z
# side (the calf, the underside of the thigh, the front of the upper arm).
def limb(k, name, rows, mat, ring=8):
    k.begin(name)
    k.loft(limb_sections(name, rows), mat, axis="y", ring=ring, steps=1, sharp=80)


# A limb in a cut of its own: `paint` takes (t, up, side), t from joint to joint
def cut(k, node, rows, paint, ring=10):
    name = next(base for base in LENGTHS if node.startswith(base))
    sections = limb_sections(name, rows)
    skin = Skin(sections, 1, span=(-LENGTHS[name] / 2, LENGTHS[name]))
    k.begin(node)
    skin.shell = k.loft(sections, skin.zones(paint), axis="y", ring=ring, steps=1, sharp=80)
    return skin


# The helmet shell's sections, along y (Kit.loft)
SHELL = [
    (-0.148, -0.08, 0.1, 0.08, 2.4, 2.2),
    (-0.125, -0.108, 0.14, 0.106, 2.4, 2.2),
    (-0.075, -0.128, 0.158, 0.124, 2.3, 2.1),
    (-0.01, -0.14, 0.152, 0.131, 2.2, 2.1),
    (0.05, -0.14, 0.132, 0.129, 2.1, 2.1),
    (0.1, -0.12, 0.098, 0.11, 2.0, 2.0),
    (0.132, -0.08, 0.055, 0.072, 2.0, 2.0),
    (0.146, -0.03, 0.018, 0.028),
]
SKULL = Skin(SHELL, 3)


# The crew's full-face shell: an egg, longer than it is wide, the visor across
# the eye port, vents and a lip at the back. `shell` picks each face's material.
def helmet(k, name, shell, ring=16, steps=3):
    k.begin(name)
    k.loft(SHELL, shell, axis="y", ring=ring, steps=steps, sharp=80)
    k.box((0.07, 0.022, 0.02), (0, -0.098, 0.146), "visor", rot=(0.25, 0, 0), bevel=0.006)
    for side in (-1, 1):
        k.box((0.03, 0.012, 0.045), (side * 0.05, 0.128, 0.03), "visor", rot=(0.35, 0, 0), bevel=0.004)
        k.cylinder(0.017, 0.012, (side * 0.129, -0.012, 0.03), "glove", axis="x", seg=8)
    k.loft([(-0.06, -0.165, -0.13, 0.05), (-0.005, -0.172, -0.13, 0.075, 2.4, 2.4), (0.05, -0.16, -0.125, 0.06), (0.075, -0.145, -0.115, 0.03)],
           "helmet_accent", axis="y", ring=8, steps=1)


# An outfit's helmet: the same shell painted by `paint(y, up, side)`, with a
# visor proud of its port, a neck roll, a spoiler lip, a chin vent, crown
# vents, an exhaust vent and the visor's pivot plates. `seam` is the cut line
# of a chin bar that lifts, with the wider plates it turns on; `mirror` splits
# the visor into two tints.
def lid(k, name, paint, lip="helmet", vents="visor", plates="glove", chin="visor", seam=False, mirror=False):
    def zone(y, up, side):
        if y < -0.13:
            return "glove"
        if up > 0.35 and -0.05 < y < 0.05:
            return "visor"
        return paint(y, up, side)

    k.begin(name)
    k.loft(SHELL, SKULL.zones(zone), axis="y", ring=16, steps=3, sharp=80)
    if mirror:
        decal(k, SKULL, [(14, 0.024), (166, 0.024)], 0.05, "visor", lift=0.004, step=14)
        decal(k, SKULL, [(14, -0.026), (166, -0.026)], 0.05, "visor_accent", lift=0.004, step=14)
    else:
        decal(k, SKULL, [(14, 0.0), (166, 0.0)], 0.1, "visor", lift=0.004, across=2, step=14)
    k.box((0.07, 0.022, 0.02), (0, -0.098, 0.146), chin, rot=(0.25, 0, 0), bevel=0.006)
    # The small vents are plain blocks: a bevel on them is under a pixel from the chase camera and a kilobyte a helmet
    k.box((0.06, 0.016, 0.012), (0, -0.02, -0.141), vents, bevel=0)
    for side in (-1, 1):
        k.box((0.03, 0.012, 0.045), (side * 0.05, 0.128, 0.03), vents, rot=(0.35, 0, 0), bevel=0)
        k.cylinder(0.027 if seam else 0.018, 0.012, (side * 0.129, -0.012, 0.03), plates, axis="x", seg=10)
    k.loft([(-0.06, -0.165, -0.13, 0.05), (-0.005, -0.172, -0.13, 0.075, 2.4, 2.4), (0.05, -0.16, -0.125, 0.06), (0.075, -0.145, -0.115, 0.03)],
           lip, axis="y", ring=8, steps=1)
    k.loft([(-0.168, -0.062, 0.078, 0.064), (-0.152, -0.084, 0.102, 0.083), (-0.14, -0.078, 0.096, 0.078)], "glove", axis="y", ring=10, steps=1, sharp=80)
    if seam:
        decal(k, SKULL, [(8, -0.02), (22, -0.078), (26, -0.128)], 0.006, "glove", both=True)


# The jacket's sections, along y: the hips, a waist drawn in, the ribs, a deep
# chest under round shoulder blades, square shoulders, the slope up to the
# neck. The hips are no further back than the seat's luggage allows
# (tests/unit/bikemodels.test.js keeps 4 cm between them).
TORSO = [
    (-0.27, -0.07, 0.07, 0.08),
    (-0.23, -0.115, 0.113, 0.15, 2.6, 2.6),
    (-0.15, -0.106, 0.1, 0.141, 2.5, 2.5),
    (-0.07, -0.094, 0.093, 0.127, 2.4, 2.5),
    (0.03, -0.108, 0.117, 0.157, 2.6, 2.5, 0.5, 0.96, 1.0),
    (0.12, -0.12, 0.128, 0.187, 2.9, 2.4, 0.5, 0.93, 1.0),
    (0.185, -0.108, 0.103, 0.19, 2.6, 2.4),
    (0.228, -0.08, 0.07, 0.108, 2.3, 2.3),
    (0.27, -0.055, 0.05, 0.058),
    (0.3, -0.05, 0.045, 0.052),
]
# A thin oversuit worn over the jacket: loose all the way down, gathered by
# the elastic of its hem, with the cloth standing off the body in folds
RAIN = [
    (-0.27, -0.07, 0.07, 0.08),
    (-0.235, -0.114, 0.118, 0.156, 2.6, 2.6),
    (-0.2, -0.112, 0.116, 0.158, 2.5, 2.5),
    (-0.155, -0.118, 0.132, 0.174, 2.3, 2.4),
    (-0.08, -0.11, 0.118, 0.16, 2.4, 2.4),
    (0.0, -0.12, 0.13, 0.174, 2.5, 2.5),
    (0.07, -0.116, 0.124, 0.176, 2.5, 2.5),
    (0.13, -0.126, 0.136, 0.202, 2.7, 2.5),
    (0.19, -0.114, 0.11, 0.202, 2.6, 2.4),
    (0.235, -0.088, 0.08, 0.118, 2.3, 2.3),
    (0.27, -0.06, 0.055, 0.065),
    (0.3, -0.05, 0.045, 0.052),
]


# Crumples a thin garment: each point moves in or out by up to `amount`, by a
# number made from its own place, so the same script gives the same creases
def crinkle(obj, amount):
    for v in obj.data.vertices:
        wave = math.sin(v.co.x * 127.1 + v.co.y * 311.7 + v.co.z * 74.7) * 43758.5453
        v.co += v.normal * ((wave - math.floor(wave)) * 2 - 1) * amount


# A hard plate proud of a limb on the outside of its bend, from `start` to
# `end` along it: the armour over an elbow or a knee
def pad(k, skin, start, end, width, mat, thick=0.009):
    decal(k, skin, [(90, start), (90, end)], width, mat, thick=thick, lift=thick / 2 + 0.0015)


# An outfit's jacket: `paint(y, up, side)` colours it down to its `hem`, with
# the trousers below (and `under`, a shirt's hem, between them). It has a
# collar with a `lining`, armour `cups` on the shoulders, a storm `flap` down
# the front and, with `spine`, a back protector. `flare` widens a hip-length
# jacket over the trousers; `sections` is a looser garment's own shape (RAIN).
# Returns its skin for the marks of each design, with the body as `shell`.
def torso(k, name, paint, hem=-0.155, flare=1.0, collar="suit", lining=None, cups="suit", flap="suit", spine=True, under=None, sections=None):
    sections = sections or [(s[0],) + tuple(v * flare for v in s[1:4]) + tuple(s[4:]) if -0.25 < s[0] < -0.1 else s for s in TORSO]
    skin = Skin(sections, 2)

    def zone(y, up, side):
        if y < hem:
            return under if under and y > hem - 0.04 else "pants"
        return paint(y, up, side)

    k.begin(name)
    skin.shell = k.loft(sections, skin.zones(zone), axis="y", ring=16, steps=2, sharp=80)
    k.loft([(0.2, -0.094, 0.086, 0.105), (0.228, -0.09, 0.08, 0.098), (0.256, -0.086, 0.074, 0.092)],
           lambda u, up, side: (lining or collar) if u > 0.5 else collar, axis="y", ring=12, steps=1, sharp=80)
    # The shoulder armour: a cup that stands off the shoulder and overhangs the top of the arm
    for side in (-1, 1) if cups else ():
        k.loft([(0.118, -0.05, 0.05, 0.032, 2.4, 2.4, 0.5, 1, 1, side * 0.176), (0.168, -0.082, 0.078, 0.066, 2.6, 2.6, 0.5, 1, 1, side * 0.17),
                (0.214, -0.066, 0.062, 0.054, 2.4, 2.4, 0.5, 1, 1, side * 0.158), (0.236, -0.03, 0.03, 0.024, 2.4, 2.4, 0.5, 1, 1, side * 0.148)],
               cups, axis="y", ring=8, steps=1, sharp=80)
    if flap:
        decal(k, skin, [(90, hem + 0.01), (90, 0.2)], 0.03, flap, thick=0.005, lift=0.0035)
    if spine:
        decal(k, skin, [(-90, -0.12), (-90, 0.1)], 0.07, "suit", thick=0.004, lift=0.003)
    return skin


# The top of the arm fills the shoulder, the muscle is at its front and the elbow comes to a point
UPPER = [(0, 0.058, 0), (0.12, 0.066, 0.006, 0.004), (0.32, 0.06, 0.004, 0.008), (0.55, 0.052, 0, 0.006), (0.8, 0.047, 0.004), (0.93, 0.047, 0.014), (1, 0.045, 0.016)]
# Thick below the elbow, drawn in to the wrist, the glove's cuff over it
FORE = [(0, 0.046, 0.016), (0.1, 0.052, 0.014, 0.004), (0.28, 0.051, 0.004, 0.006), (0.55, 0.044, 0, 0.002), (0.78, 0.037, 0), (0.8, 0.044, 0), (1, 0.042, 0)]
# A long glove cuff flares over the sleeve
GAUNTLET = [(0, 0.046, 0.016), (0.1, 0.052, 0.014, 0.004), (0.28, 0.051, 0.004, 0.006), (0.55, 0.043, 0), (0.6, 0.057, 0), (0.8, 0.048, 0), (1, 0.043, 0)]
# Full at the seat, the muscle on top, drawn in to a knee that stands out
THIGH = [(0, 0.08, 0), (0.2, 0.083, 0.004, 0.003), (0.55, 0.074, 0.006), (0.85, 0.064, 0.004), (1, 0.061, 0.012)]
# The kneecap, the calf behind, the ankle. The trouser leg goes down to the ankle, over the boot.
SHIN = [(0, 0.058, 0.022), (0.1, 0.061, 0.026), (0.26, 0.057, 0.01, 0.008), (0.45, 0.052, 0.002, 0.012), (0.7, 0.047, 0, 0.004), (0.92, 0.046, 0), (1, 0.05, 0)]
JEANS = [(0, 0.058, 0.012), (0.12, 0.06, 0.012, 0.002), (0.32, 0.055, 0.004, 0.01), (0.6, 0.05, 0, 0.006), (0.92, 0.048, 0), (1, 0.052, 0)]
# The oversuit's sleeves and legs: loose, in folds, gathered by elastic at the wrist and over the boot
RAIN_UPPER = [(0, 0.066, 0), (0.1, 0.076, 0.006, 0.004), (0.25, 0.068, 0.004, 0.006), (0.4, 0.074, 0.004, 0.004), (0.6, 0.064, 0.006, 0.002), (0.8, 0.068, 0.01), (1, 0.06, 0.014)]
RAIN_FORE = [(0, 0.06, 0.014), (0.15, 0.066, 0.01, 0.004), (0.35, 0.058, 0.004, 0.004), (0.55, 0.063, 0, 0.002), (0.72, 0.056, 0), (0.79, 0.036, 0), (0.83, 0.044, 0), (1, 0.042, 0)]
RAIN_THIGH = [(0, 0.084, 0), (0.2, 0.09, 0.004, 0.003), (0.4, 0.083, 0.008), (0.6, 0.087, 0.006, 0.002), (0.85, 0.076, 0.006), (1, 0.072, 0.014)]
RAIN_SHIN = [(0, 0.07, 0.02), (0.12, 0.074, 0.022, 0.004), (0.3, 0.066, 0.01, 0.01), (0.45, 0.07, 0.004, 0.008), (0.62, 0.062, 0, 0.006), (0.8, 0.066, 0, 0.002), (0.93, 0.054, 0), (1, 0.05, 0)]


# A path all the way round a skin at `s`
def hoop(s):
    return [(0, s), (120, s), (240, s), (360, s)]


def build_crew(k):
    # Jacket: wide at the shoulders, drawn in at the waist, a collar on top;
    # below the belt it is the trousers
    def jacket(u, up, side):
        if u <= 0.19:
            return "pants"
        if 0.19 < u < 0.26:
            return "glove"
        if up > 0.55 and 0.42 < u < 0.72:
            return "suit_accent"
        # A yoke across the shoulders, which is what the chase camera sees
        if up < -0.3 and 0.62 < u < 0.74:
            return "suit_accent"
        return "suit"

    k.begin("torso")
    k.loft(TORSO, jacket, axis="y", ring=16, steps=2, sharp=80)

    k.begin("hump")
    k.loft([(0.0, -0.13, -0.08, 0.025), (0.06, -0.15, -0.08, 0.05, 2.4, 2.4), (0.15, -0.16, -0.08, 0.058, 2.4, 2.4), (0.21, -0.14, -0.07, 0.045), (0.24, -0.11, -0.06, 0.02)],
           "suit", axis="y", ring=10, steps=2, sharp=80)

    # Helmet: a stripe over the crown
    def shell(u, up, side):
        if u < 0.07:
            return "glove"
        if up > 0.35 and 0.3 < u < 0.64:
            return "visor"
        if abs(side) < 0.25 and u > 0.3:
            return "helmet_accent"
        return "helmet"

    helmet(k, "helmet", shell)

    def peak(u, v):
        across = (v - 0.5) * 2
        return (across * (0.105 - 0.035 * u), 0.092 - 0.03 * u - 0.02 * across * across, 0.07 + 0.2 * u)

    k.begin("peak")
    k.sheet(peak, "helmet_accent", nu=4, nv=6, thick=0.008)

    def sleeve(cuff):
        return lambda u, up, side: "glove" if u > cuff else ("suit_accent" if (up > 0.5 and u < 0.36) else "suit")

    limb(k, "upper_arm", [(0, 0.06, 0), (0.1, 0.062, 0), (0.5, 0.052, 0), (0.92, 0.046, 0.006), (1, 0.045, 0.01)],
         lambda u, up, side: "suit_accent" if 0.2 < u < 0.34 else "suit")
    limb(k, "forearm", [(0, 0.046, 0.012), (0.12, 0.05, 0.01), (0.5, 0.045, 0), (0.78, 0.038, 0), (0.8, 0.044, 0), (1, 0.042, 0)], sleeve(0.7))
    limb(k, "thigh", THIGH, "pants", ring=10)
    limb(k, "shin", [(0, 0.06, 0.02), (0.12, 0.062, 0.022), (0.3, 0.06, 0.008), (0.52, 0.05, 0), (0.55, 0.057, 0), (0.8, 0.054, 0), (1, 0.052, 0)],
         lambda u, up, side: "boot" if u > 0.56 else ("pants_accent" if (up > 0.5 and u < 0.36) else "pants"), ring=10)

    k.begin("glove")
    k.loft(FIST, lambda u, up, side: "suit_accent" if (up > 0.7 and 0.3 < u < 0.8) else "glove", ring=10, steps=1, sharp=80)

    k.begin("boot")
    k.loft(FOOT, lambda u, up, side: "boot_accent" if up < -0.8 else "boot", ring=10, steps=2, sharp=80)

    # A daypack on the back, its straps over the shoulders
    k.begin("backpack")
    k.loft([(-0.13, -0.2, -0.1, 0.1), (-0.1, -0.235, -0.1, 0.14, 3, 3), (0.12, -0.245, -0.1, 0.145, 3, 3), (0.17, -0.225, -0.1, 0.12, 3, 3), (0.195, -0.19, -0.1, 0.06)],
           "backpack", axis="y", ring=10, steps=1, sharp=60)
    k.box((0.16, 0.12, 0.03), (0, -0.04, -0.25), "backpack", bevel=0.01)
    for side in (-1, 1):
        k.tube([(side * 0.075, 0.15, -0.1), (side * 0.08, 0.215, -0.03), (side * 0.085, 0.18, 0.1), (side * 0.09, 0.02, 0.135)], 0.012, "backpack", seg=4, smooth=1)


FIST = [(-0.06, -0.022, 0.022, 0.03), (-0.04, -0.034, 0.036, 0.044, 3, 3), (0.0, -0.038, 0.042, 0.05, 3, 3), (0.04, -0.036, 0.036, 0.048, 3, 3), (0.058, -0.02, 0.02, 0.036)]
FOOT = [(-0.085, -0.03, 0.03, 0.03), (-0.07, -0.038, 0.06, 0.044, 2.4, 4), (-0.02, -0.038, 0.075, 0.05, 2.4, 4), (0.05, -0.038, 0.04, 0.052, 2.4, 4),
        (0.13, -0.038, 0.018, 0.049, 2.4, 4), (0.17, -0.034, 0.0, 0.034, 2.4, 3)]


def build_helmets(k):
    # Plain: one colour, the vents in the accent
    lid(k, "helmet_plain", lambda y, up, side: "helmet", vents="helmet_accent", chin="helmet_accent")

    # Lines: thin curved lines swept back over a plain shell, and a camera mount on the crown
    lid(k, "helmet_lines", lambda y, up, side: "helmet")
    for path, width in (([(72, 0.112), (20, 0.09), (-40, 0.072), (-86, 0.02)], 0.007), ([(14, 0.064), (-20, 0.022), (-60, -0.03), (-88, -0.072)], 0.009),
                        ([(16, -0.07), (-30, -0.086), (-80, -0.11)], 0.006), ([(-8, 0.108), (-50, 0.112), (-82, 0.084)], 0.005)):
        decal(k, SKULL, path, width, "helmet_accent", lift=0.0025, both=True)
    k.box((0.032, 0.02, 0.046), (0, 0.153, 0.0), "glove", bevel=0.004)

    # Panels: a centre stripe from the brow over the crown and on the chin, dark panels on the top and the sides
    def panel(y, up, side):
        if abs(side) < 0.2 and (y > 0.05 or (up < 0 and y > -0.05) or (up > 0 and y < -0.06)):
            return "helmet_trim"
        if y > 0.08 and 0.2 <= abs(side) < 0.85:
            return "helmet_accent"
        if -0.5 < up < 0.3 and -0.09 < y < 0.03:
            return "helmet_accent"
        return "helmet"

    lid(k, "helmet_panel", panel)

    # Modular: plain, with the seam of a chin bar that lifts, dark plates and vents
    lid(k, "helmet_modular", lambda y, up, side: "helmet", vents="helmet_accent", plates="helmet_accent", chin="helmet_accent", seam=True)

    # Bands: dark bands round the crown and round the back, a mirrored visor
    def band(y, up, side):
        if 0.067 < y < 0.1 and up < 0.6:
            return "helmet_accent"
        if up < 0.1 and -0.1 < y < -0.05:
            return "helmet_accent"
        return "helmet"

    lid(k, "helmet_band", band, mirror=True)

    # Chin: the crown and back one colour, the front, the chin bar and the visor surround the other
    lid(k, "helmet_chin", lambda y, up, side: "helmet_accent" if (up > 0.35 and y < 0.07) else "helmet", chin="helmet_accent")
    decal(k, SKULL, [(83, 0.078), (97, 0.078)], 0.012, "helmet_trim", lift=0.003)

    # Stripes: two stripes over the crown and a panel on the chin
    def stripes(y, up, side):
        if 0.25 < abs(side) < 0.5 and y > (0.05 if up > 0 else -0.03):
            return "helmet_accent"
        if up > 0.9 and y < -0.055:
            return "helmet_accent"
        return "helmet"

    lid(k, "helmet_stripes", stripes, chin="helmet_accent")

    # Streak: broad blades, each from a tip at the front to a broad end at the
    # back. Three sweep back from the brow along the side of the crown (the
    # accent, the trim, the accent); three fan up and back from the chin
    # across the cheek (the accent, the trim, the shell colour). The ground
    # is the shell colour above and the accent low at the back and under the chin.
    def ground(y, up, side):
        if y < -0.09 or (y < -0.02 and up < 0.25):
            return "helmet_accent"
        return "helmet"

    lid(k, "helmet_streak", ground)
    for mat, path in (
            ("helmet_accent", [(74, 0.106, 0.002), (30, 0.118, 0.014), (-30, 0.112, 0.024), (-80, 0.09, 0.03)]),
            ("helmet_trim", [(68, 0.084, 0.002), (25, 0.092, 0.018), (-30, 0.078, 0.03), (-82, 0.05, 0.036)]),
            ("helmet_accent", [(44, 0.068, 0.002), (0, 0.06, 0.012), (-45, 0.04, 0.018), (-84, 0.012, 0.02)]),
            ("helmet_accent", [(74, -0.082, 0.003), (42, -0.07, 0.024), (12, -0.046, 0.034)]),
            ("helmet_trim", [(72, -0.112, 0.003), (34, -0.098, 0.018), (-16, -0.07, 0.03), (-62, -0.04, 0.036)]),
            ("helmet", [(58, -0.126, 0.003), (18, -0.118, 0.012), (-32, -0.1, 0.02), (-74, -0.082, 0.026)])):
        decal(k, SKULL, path, 0.0, mat, lift=0.003, both=True, step=14, across=2 if max(p[2] for p in path) > 0.028 else 1)

    # Graphic: the shell colour over the crown and down the middle of the chin
    # bar, the accent low on the sides and round the back, the trim round the
    # eye port and in lines between the two, a blade of the accent swept back
    # over each side of the crown and a plain oval mark on the brow
    def graphic(y, up, side):
        if up > 0.3 and -0.075 < y < 0.075:
            return "helmet_trim"
        if y < -0.045 and (abs(side) > 0.35 or up < 0):
            return "helmet_accent"
        return "helmet"

    lid(k, "helmet_graphic", graphic, chin="helmet_trim", vents="helmet_trim")
    decal(k, SKULL, [(40, -0.05), (0, -0.036), (-88, -0.036)], 0.012, "helmet_trim", lift=0.003, both=True, step=14)
    decal(k, SKULL, [(58, 0.1, 0.004), (10, 0.104, 0.02), (-55, 0.088, 0.026)], 0.0, "helmet_accent", lift=0.003, both=True, step=14)
    decal(k, SKULL, [(50, 0.082, 0.003), (8, 0.082, 0.007), (-55, 0.064, 0.008)], 0.0, "helmet_trim", lift=0.003, both=True, step=14)
    badge(k, SKULL, 90, 0.092, [(math.sin(i * math.pi / 4) * 0.022, math.cos(i * math.pi / 4) * 0.011) for i in range(8)], "helmet_accent", lift=0.003)


def build_jackets(k):
    # Yoke: an accent yoke over the shoulders and down the outside of the
    # arms, trim on the lower sides, the collar lining and inside the
    # forearms, a patch on the left chest and a bar across the upper back
    skin = torso(k, "torso_yoke", lambda y, up, side: "suit_accent" if y > 0.125 else ("suit_trim" if (abs(side) > 0.6 and y < 0.03) else "suit"),
                 lining="suit_trim", cups="suit_accent")
    decal(k, skin, [(52, 0.09), (68, 0.09)], 0.022, "suit_patch")
    decal(k, skin, [(-112, 0.115), (-68, 0.115)], 0.026, "suit_patch", lift=0.0075)
    skin = cut(k, "upper_arm_yoke", UPPER, lambda t, up, side: "suit_accent" if (up > 0 and t < 0.85) else "suit")
    decal(k, skin, [(70, 0.42), (110, 0.42)], 0.02, "suit_patch", lift=0.004)
    skin = cut(k, "forearm_yoke", FORE, lambda t, up, side: "glove" if t > 0.78 else ("suit_trim" if up < -0.2 else "suit"))
    decal(k, skin, hoop(0.69), 0.012, "suit_patch", lift=0.004)
    pad(k, skin, 0.02, 0.3, 0.066, "suit")

    # Piping: thin accent lines (a diagonal on each side of the chest, lines
    # on the back of the shoulders, one down each forearm), a large
    # star-shaped patch on the left chest and a reflective bar on each upper arm
    skin = torso(k, "torso_piping", lambda y, up, side: "suit")
    decal(k, skin, [(80, 0.17), (40, 0.05)], 0.009, "suit_accent", both=True)
    decal(k, skin, [(-72, 0.2), (-25, 0.14)], 0.008, "suit_accent", both=True)
    badge(k, skin, 57, 0.095, star(0.055), "suit_patch")
    skin = cut(k, "upper_arm_bar", UPPER, lambda t, up, side: "suit")
    decal(k, skin, [(20, 0.38), (160, 0.38)], 0.022, "suit_patch", lift=0.004)
    skin = cut(k, "forearm_line", FORE, lambda t, up, side: "glove" if t > 0.78 else "suit")
    pad(k, skin, 0.02, 0.3, 0.066, "suit")
    decal(k, skin, [(90, 0.08), (90, 0.72)], 0.009, "suit_accent", lift=0.012)

    # Plain: one colour, armour overlays on the shoulders and elbows in the
    # accent, a small patch in the trim on the left chest, a patch on each arm
    skin = torso(k, "torso_plain", lambda y, up, side: "suit", cups="suit_accent")
    decal(k, skin, [(53, 0.1), (67, 0.1)], 0.022, "suit_trim")
    skin = cut(k, "upper_arm_plain", UPPER, lambda t, up, side: "suit_accent" if (up > 0 and (t < 0.26 or t > 0.86)) else "suit")
    decal(k, skin, [(72, 0.42), (108, 0.42)], 0.03, "suit_patch", lift=0.004)
    skin = cut(k, "forearm_plain", FORE, lambda t, up, side: "glove" if t > 0.78 else "suit")
    pad(k, skin, 0.02, 0.3, 0.066, "suit")
    skin = cut(k, "forearm_band", FORE, lambda t, up, side: "glove" if t > 0.78 else "suit")
    decal(k, skin, [(10, 0.5), (170, 0.5)], 0.028, "suit_patch", lift=0.004)
    pad(k, skin, 0.02, 0.3, 0.066, "suit_accent")

    # Bars: hip length, reflective bars (a diagonal on each side of the chest
    # and one on the back of each shoulder), piping down each side, trim in
    # the collar and inside the front edge
    skin = torso(k, "torso_bars", lambda y, up, side: "suit", hem=-0.21, flare=1.05, lining="suit_trim")
    decal(k, skin, [(76, 0.16), (46, 0.07)], 0.016, "suit_patch", both=True)
    decal(k, skin, [(-68, 0.185), (-28, 0.16)], 0.014, "suit_patch", both=True)
    decal(k, skin, [(8, 0.08), (8, -0.17)], 0.008, "suit_patch", both=True)
    decal(k, skin, [(90, 0.21), (90, 0.09)], 0.006, "suit_trim", lift=0.0075)

    # Touring: hip length, an accent yoke, collar, hem band and waist strap,
    # reflective strips down the chest, a trim line across the shoulder
    # blades, cargo pockets; chevrons in the trim on a band above each elbow
    skin = torso(k, "torso_touring", lambda y, up, side: "suit_accent" if (y > 0.14 or y < -0.175) else "suit",
                 hem=-0.215, flare=1.06, collar="suit_accent", cups="suit_accent")
    decal(k, skin, hoop(-0.06), 0.022, "suit_accent", lift=0.0065)
    decal(k, skin, [(64, 0.12), (64, 0.0)], 0.016, "suit_patch", both=True)
    decal(k, skin, [(-150, 0.125), (-30, 0.125)], 0.008, "suit_trim")
    decal(k, skin, [(28, -0.125), (60, -0.125)], 0.07, "suit", thick=0.006, lift=0.004, both=True)

    def chevron(t, up, side):
        return "suit_accent" if (0.6 < t < 0.86 or (up > 0.3 and t <= 0.6)) else "suit"

    skin = cut(k, "upper_arm_chevron", UPPER, chevron)
    for step in (0.0, 0.075):
        decal(k, skin, [(38, 0.64 + step), (90, 0.71 + step), (142, 0.64 + step)], 0.011, "suit_trim", lift=0.004)
    cut(k, "forearm_cuff", GAUNTLET, lambda t, up, side: "glove" if t > 0.57 else "suit_accent")

    # Bands: a leather-look band across the chest and round each upper arm, a
    # dark inner collar and a shield badge on the arm
    skin = torso(k, "torso_bands", lambda y, up, side: "suit_accent" if (0.08 < y < 0.13 and up > -0.3) else "suit", collar="suit_trim")
    skin = cut(k, "upper_arm_band", UPPER, lambda t, up, side: "suit_accent" if 0.3 < t < 0.5 else "suit")
    badge(k, skin, 90, 0.17, shield(0.022), "suit_patch")

    # Waxed: a casual cut with no armour, quilted shoulders and a collar in
    # the accent, chest pockets with flaps
    skin = torso(k, "torso_waxed", lambda y, up, side: "suit_accent" if y > 0.14 else "suit", hem=-0.17, flare=1.04, collar="suit_accent",
                 cups="suit_accent", spine=False)
    decal(k, skin, [(48, 0.055), (74, 0.055)], 0.075, "suit", thick=0.006, lift=0.004, both=True)
    decal(k, skin, [(47, 0.088), (75, 0.088)], 0.022, "suit_accent", lift=0.0085, both=True)

    # Leather: a short sport cut over a hoodie (its hem below, its hood at the
    # back of the neck), panel seams, a curved piping line down the chest and
    # the side, a stripe down the back of each shoulder blade, a small
    # star-shaped patch on the left chest and a larger one on each upper arm
    skin = torso(k, "torso_leather", lambda y, up, side: "suit", hem=-0.115, under="suit_trim")
    decal(k, skin, [(-62, 0.19), (-62, 0.07)], 0.016, "suit_patch", both=True)
    decal(k, skin, [(78, 0.18), (58, 0.09), (28, -0.01), (10, -0.1)], 0.006, "suit_patch", both=True)
    decal(k, skin, [(66, 0.16), (70, 0.02), (64, -0.1)], 0.004, "suit_accent", both=True)
    decal(k, skin, [(-35, 0.12), (-90, 0.135), (-145, 0.12)], 0.004, "suit_accent")
    decal(k, skin, [(-40, 0.1), (-48, -0.1)], 0.004, "suit_accent", both=True)
    badge(k, skin, 58, 0.105, star(0.024), "suit_patch")
    decal(k, skin, [(-106, -0.07), (-74, -0.07)], 0.02, "suit_patch", lift=0.0075)
    k.loft([(0.17, -0.14, -0.07, 0.07), (0.2, -0.158, -0.06, 0.1, 2.6, 2.6), (0.238, -0.15, -0.062, 0.092, 2.6, 2.6), (0.262, -0.125, -0.07, 0.05)],
           "suit_trim", axis="y", ring=8, steps=2, sharp=80)
    skin = cut(k, "upper_arm_star", UPPER, lambda t, up, side: "suit")
    badge(k, skin, 90, 0.3, star(0.034), "suit_patch")
    decal(k, skin, [(20, 0.62), (160, 0.62)], 0.004, "suit_accent", lift=0.004)

    # Open: a plain jacket worn open over a top in the accent, which shows
    # down the front and below the hem; the jacket's front edges stand off
    # it. A hoodie in the trim is tied round the waist: its body hangs down
    # the back, its sleeves are knotted at the front and their ends hang
    skin = torso(k, "torso_open", lambda y, up, side: "suit_accent" if (up > 0.8 and y < 0.2) else "suit", hem=-0.15, under="suit_accent",
                 flap=None, spine=False)
    decal(k, skin, [(64, -0.15), (66, 0.06), (72, 0.2)], 0.034, "suit", thick=0.012, lift=0.007, both=True)
    k.loft([(-0.215, -0.126, 0.118, 0.158, 2.6, 2.6), (-0.19, -0.13, 0.124, 0.164, 2.6, 2.6), (-0.15, -0.122, 0.12, 0.16, 2.6, 2.6), (-0.128, -0.112, 0.11, 0.15, 2.6, 2.6)],
           "suit_trim", axis="y", ring=12, steps=1, sharp=80)
    k.box((0.07, 0.04, 0.03), (0, -0.168, 0.128), "suit_trim", bevel=0.008)
    for side in (-1, 1):
        k.box((0.036, 0.1, 0.02), (side * 0.035, -0.225, 0.122), "suit_trim", rot=(-0.3, 0, side * 0.3), bevel=0.006)

    # Rain: a thin oversuit, loose and crumpled. The hood lies down round the
    # collar with its two cords (the trim) down the chest, a flap covers the
    # front zip, a small pale mark is on the left chest
    skin = torso(k, "torso_rain", lambda y, up, side: "suit", hem=-0.2, cups=None, flap=None, spine=False, sections=RAIN)
    crinkle(skin.shell, 0.007)
    decal(k, skin, [(88, -0.19), (88, 0.2)], 0.046, "suit", thick=0.014, lift=0.008)
    decal(k, skin, [(80, 0.21), (76, 0.085)], 0.006, "suit_trim", lift=0.011, both=True)
    decal(k, skin, [(52, 0.1), (65, 0.1)], 0.016, "suit_patch", lift=0.011)
    hood = k.loft([(0.176, -0.15, -0.045, 0.085), (0.206, -0.176, -0.02, 0.134, 2.4, 2.4), (0.242, -0.17, -0.025, 0.126, 2.4, 2.4), (0.27, -0.13, -0.05, 0.07)],
                  "suit", axis="y", ring=10, steps=2, sharp=80)
    crinkle(hood, 0.007)
    crinkle(cut(k, "upper_arm_rain", RAIN_UPPER, lambda t, up, side: "suit").shell, 0.005)
    crinkle(cut(k, "forearm_rain", RAIN_FORE, lambda t, up, side: "glove" if t > 0.81 else "suit").shell, 0.005)


def build_trousers(k):
    # A diagonal slash across the thigh
    skin = cut(k, "thigh_slash", THIGH, lambda t, up, side: "pants")
    decal(k, skin, [(150, 0.2), (90, 0.42), (30, 0.64)], 0.03, "pants_accent", lift=0.004)
    # A cargo pocket on the outside, a small tab at its top
    skin = cut(k, "thigh_pocket", THIGH, lambda t, up, side: "pants")
    decal(k, skin, [(-28, 0.46), (28, 0.46)], 0.1, "pants", thick=0.006, lift=0.004, both=True)
    decal(k, skin, [(-9, 0.31), (9, 0.31)], 0.016, "pants_accent", lift=0.0085, both=True)
    # A U-shaped reflective line round the knee
    skin = cut(k, "shin_knee", SHIN, lambda t, up, side: "pants")
    decal(k, skin, [(35, 0.04), (42, 0.26), (90, 0.36), (138, 0.26), (145, 0.04)], 0.009, "pants_trim", lift=0.004)
    pad(k, skin, 0.0, 0.25, 0.07, "pants")
    # Piping down the outside of the leg and a short line across the shin
    skin = cut(k, "shin_stripe", SHIN, lambda t, up, side: "pants")
    decal(k, skin, [(0, 0.08), (0, 0.92)], 0.01, "pants_trim", lift=0.004, both=True)
    decal(k, skin, [(60, 0.55), (120, 0.55)], 0.008, "pants_accent", lift=0.004)
    pad(k, skin, 0.0, 0.25, 0.07, "pants")
    # A long mark down the outside of the shin and a small one at the knee
    skin = cut(k, "shin_mark", SHIN, lambda t, up, side: "pants")
    decal(k, skin, [(0, 0.42), (0, 0.78)], 0.022, "pants_trim", lift=0.004, both=True)
    pad(k, skin, 0.0, 0.25, 0.07, "pants")
    decal(k, skin, [(78, 0.1), (102, 0.1)], 0.014, "pants_trim", lift=0.013)
    # Jeans: no armour at the knee
    cut(k, "shin_jeans", JEANS, lambda t, up, side: "pants")
    # The oversuit's trousers
    crinkle(cut(k, "thigh_rain", RAIN_THIGH, lambda t, up, side: "pants").shell, 0.005)
    crinkle(cut(k, "shin_rain", RAIN_SHIN, lambda t, up, side: "pants").shell, 0.005)


def build_hands_feet(k):
    # A short glove with hard knuckles and a panel on the back of the hand
    k.begin("glove_armour")
    k.loft(FIST, lambda u, up, side: "glove_accent" if (up > 0.7 and 0.3 < u < 0.8) else "glove", ring=10, steps=1, sharp=80)
    k.box((0.08, 0.014, 0.024), (0, 0.04, 0.014), "glove_accent", bevel=0.005)
    k.loft([(-0.088, -0.03, 0.032, 0.04), (-0.056, -0.037, 0.039, 0.047)], "glove", ring=8, steps=1, sharp=80)

    # Riding trainers: a high top round the ankle, a thick midsole
    k.begin("boot_trainer")
    k.loft([(-0.085, -0.02, 0.035, 0.03), (-0.07, -0.022, 0.065, 0.042, 2.4, 4), (-0.02, -0.022, 0.07, 0.047, 2.4, 4), (0.05, -0.022, 0.04, 0.049, 2.4, 4),
            (0.13, -0.022, 0.02, 0.046, 2.4, 4), (0.168, -0.02, 0.004, 0.032, 2.4, 3)], "boot", ring=10, steps=2, sharp=80)
    k.loft([(-0.09, -0.04, -0.016, 0.033), (-0.07, -0.04, -0.016, 0.046, 4, 4), (0.05, -0.04, -0.016, 0.053, 4, 4), (0.13, -0.04, -0.018, 0.05, 4, 4),
            (0.174, -0.038, -0.02, 0.035, 4, 4)], lambda u, up, side: "sole" if up < -0.8 else "boot_accent", ring=10, steps=1, sharp=60)
    k.loft([(0.02, -0.082, 0.032, 0.05), (0.08, -0.08, 0.03, 0.053), (0.122, -0.076, 0.026, 0.05)], "boot", axis="y", ring=8, steps=1, sharp=80)

    # A short adventure boot: a sturdy shaft, straps with buckles over the instep and the ankle
    k.begin("boot_buckle")
    k.loft(FOOT, lambda u, up, side: "sole" if up < -0.8 else "boot", ring=10, steps=2, sharp=80)
    k.loft([(0.02, -0.084, 0.034, 0.054), (0.1, -0.082, 0.032, 0.056), (0.15, -0.078, 0.028, 0.053)], "boot", axis="y", ring=8, steps=1, sharp=80)
    k.box((0.112, 0.016, 0.03), (0, 0.045, 0.045), "boot_accent", rot=(0.6, 0, 0), bevel=0.004)
    for y in (0.085, 0.128):
        k.box((0.118, 0.022, 0.012), (0, y, 0.034), "boot_accent", bevel=0.004)

    # A road boot: a shaft to the middle of the shin over a heel and a sole,
    # with a plate on the shin, a band round the top and a heel cup in the accent
    k.begin("boot_road")
    k.loft(FOOT, lambda u, up, side: "sole" if up < -0.8 else "boot", ring=10, steps=2, sharp=80)
    k.loft([(0.02, -0.086, 0.036, 0.055), (0.09, -0.084, 0.034, 0.056), (0.165, -0.082, 0.03, 0.056)], "boot", axis="y", ring=8, steps=1, sharp=80)
    k.box((0.06, 0.085, 0.012), (0, 0.105, 0.036), "boot_accent", rot=(-0.04, 0, 0), bevel=0.004)
    k.box((0.122, 0.018, 0.05), (0, 0.15, -0.024), "boot_accent", bevel=0.004)
    k.box((0.07, 0.04, 0.016), (0, 0.022, -0.086), "boot_accent", bevel=0.004)

    # A rain cover pulled over a boot: a loose bag, gathered by elastic above the ankle
    k.begin("boot_cover")
    bag = k.loft([(s[0] * 1.06,) + tuple(v * 1.14 for v in s[1:4]) + tuple(s[4:]) for s in FOOT], "boot", ring=10, steps=2, sharp=80)
    crinkle(bag, 0.004)
    top = k.loft([(0.015, -0.094, 0.044, 0.062), (0.075, -0.092, 0.04, 0.064), (0.12, -0.078, 0.028, 0.052), (0.14, -0.086, 0.034, 0.058)], "boot", axis="y", ring=8, steps=1, sharp=80)
    crinkle(top, 0.003)

    # A reflective bar across the shoulder blades of a jacket of the plain
    # cut, for a kit that names it (backStyle): a mark that reads from behind
    k.begin("back_bar")
    decal(k, Skin(TORSO, 2), [(-126, 0.116), (-54, 0.116)], 0.04, "suit_trim", lift=0.0085)

    # A neck tube, gathered in folds under the helmet
    k.begin("neck")
    k.loft([(0.2, -0.088, 0.074, 0.082), (0.225, -0.096, 0.082, 0.09), (0.25, -0.088, 0.074, 0.082), (0.272, -0.092, 0.076, 0.085), (0.3, -0.08, 0.064, 0.07)],
           "neck", axis="y", ring=10, steps=2, sharp=80)

# The outfits, read from the game's own list so the two cannot drift apart
def outfits():
    source = open(os.path.join(ROOT, "js", "vehicle.js")).read()
    head = source[:source.index("\n];", source.index("const CHARACTERS")) + 3]
    script = head + "\nconsole.log(JSON.stringify(CHARACTERS.map((c) => ({ id: c.id, build: c.build, outfits: c.outfits }))));"
    return json.loads(subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout)


# The colour each material takes from an outfit's kit, as js/bikemodels.js gives them
def colours(kit):
    glove = kit.get("gloveColor", 0x101014)
    accent = kit["suitAccent"]
    visor = kit.get("visorColor", 0x0E1218)
    pants_accent = kit.get("pantsAccent", accent)
    return {
        "suit": kit["suitColor"], "suit_accent": accent, "suit_trim": kit.get("suitTrim", accent), "suit_patch": kit.get("suitPatch", accent),
        "glove": glove, "glove_accent": kit.get("gloveAccent", glove), "pants": kit.get("pantsColor", kit["suitColor"]), "pants_accent": pants_accent,
        "pants_trim": kit.get("pantsTrim", pants_accent), "boot": kit.get("bootColor", glove), "boot_accent": kit.get("bootAccent", accent),
        "helmet": kit["helmetColor"], "helmet_accent": kit["helmetAccent"], "helmet_trim": kit.get("helmetTrim", kit["helmetAccent"]),
        "backpack": kit.get("backpackColor") or kit["suitColor"], "neck": kit.get("neckColor") or 0, "visor": visor, "visor_accent": kit.get("visorAccent", visor),
    }


# Where two limbs of lengths a and b from `start` to `end` meet, bent toward `toward` (Vehicle.joint)
def joint(start, end, a, b, toward):
    line = end - start
    reach = line.length
    stretch = max(1.0, reach / ((a + b) * 0.995))
    a, b = a * stretch, b * stretch
    line.normalize()
    along = (a * a - b * b + reach * reach) / (2 * reach)
    off = math.sqrt(max(0.0, a * a - along * along))
    bend = (toward - line * toward.dot(line)).normalized()
    return start + line * along + bend * off


# One rider seated as js/bikemodels.js seats it on a middleweight naked bike,
# standing at `place` and turned by `yaw`; returns the objects it made
def seat(k, joined, kit, build, place, yaw):
    swap = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    root = Matrix.Translation(place) @ Matrix.Rotation(yaw, 4, "Y")
    made = []

    def put(name, style, local):
        obj = bpy.data.objects.new("seated", joined[f"{name}_{style}" if style else name].data)
        k.scene.collection.objects.link(obj)
        obj.matrix_world = swap @ root @ local @ swap.inverted()
        made.append(obj)

    tall, wide = build.get("height", 1.0), build.get("width", 1.0)
    girth = 1 + (wide - 1) * 0.6
    lean = 0.34
    up = Vector((0, math.cos(lean), math.sin(lean)))
    ahead = Vector((0, -math.sin(lean), math.cos(lean)))
    rise = 0.17 * (tall - 1)
    body = Matrix.Translation(up * rise) @ Matrix.Rotation(lean, 4, "X") @ Matrix.Diagonal((wide, tall, 1 + (wide - 1) * 0.5, 1))
    put("torso", kit.get("torsoStyle"), body)
    if kit.get("backpackColor") is not None:
        put("backpack", None, body)
    if kit.get("neckColor") is not None:
        put("neck", None, body)
    if kit.get("backStyle"):
        put("back", kit["backStyle"], body)
    put("helmet", kit.get("helmetStyle"), Matrix.Translation(up * (0.375 * tall + rise) + ahead * 0.03) @ Matrix.Rotation(lean * 0.45, 4, "X"))

    def limb(name, style, start, end, out):
        along = end - start
        length = along.length
        along.normalize()
        front = (out - along * out.dot(along)).normalized()
        across = along.cross(front)
        turn = Matrix((across, along, front)).transposed().to_4x4()
        put(name, style, Matrix.Translation((start + end) / 2) @ turn @ Matrix.Diagonal((girth, length / LENGTHS[name], girth, 1)))

    for side in (-1, 1):
        shoulder = up * (0.165 * tall + rise)
        shoulder.x = side * 0.172 * wide
        hand = Vector((side * 0.3, 0.02, 0.46))
        elbow = joint(shoulder, hand, LENGTHS["upper_arm"] * tall, LENGTHS["forearm"] * tall, Vector((side * 0.78, -0.7, -0.3)))
        bend = (elbow - (shoulder + hand) / 2).normalized()
        limb("upper_arm", kit.get("upperArmStyle"), shoulder, elbow, bend)
        limb("forearm", kit.get("forearmStyle"), elbow, hand, bend)
        put("glove", kit.get("gloveStyle"), Matrix.Translation(hand))
        sole = Vector((side * 0.21, -0.7, 0.02))
        ankle = sole + Vector((0, 0.062, -0.022))
        hip = up * -0.17
        hip.x = side * 0.09 * wide
        knee = joint(hip, ankle, LENGTHS["thigh"] * tall, LENGTHS["shin"] * tall, Vector((side * 0.16, 0.3, 1)))
        fold = (knee - (hip + ankle) / 2).normalized()
        limb("thigh", kit.get("thighStyle"), hip, knee, fold)
        limb("shin", kit.get("shinStyle"), knee, ankle, fold)
        put("boot", kit.get("bootStyle"), Matrix.Translation(sole) @ Matrix.Rotation(0.1, 4, "X"))
    return made


# With TWISTY_PREVIEW set to a directory, renders every outfit there: one
# picture each, the rider seated and seen from the front, the side and the
# rear. TWISTY_RIDER=<character id> renders that character's outfits only.
def preview(k, joined):
    out = os.environ.get("TWISTY_PREVIEW")
    if not out:
        return
    for obj in joined.values():
        obj.hide_render = True
    only = os.environ.get("TWISTY_RIDER")
    for character in outfits():
        for outfit in character["outfits"] if only in (None, character["id"]) else []:
            kit = outfit["kit"]
            for name, value in colours(kit).items():
                if name in k.materials:
                    shader = k.materials[name].node_tree.nodes["Principled BSDF"]
                    shader.inputs["Base Color"].default_value = (*rgb(value), 1)
                    if name == "suit":
                        shader.inputs["Roughness"].default_value = kit.get("suitRoughness", 0.85)
                    if name == "helmet":
                        shader.inputs["Roughness"].default_value = kit.get("helmetRoughness", 0.12)
            made = []
            for x, yaw in ((-1.1, math.radians(215)), (0.0, math.radians(90)), (1.1, math.radians(-35))):
                made += seat(k, joined, kit, character.get("build") or {}, Vector((x, 1.0, 0.0)), yaw)
            render(k.scene, os.path.join(out, f"rider-{character['id']}-{outfit['id']}.png"), (0, 1.15, 6.6), (0, 0.8, 0), size=(1200, 512), lens=70)
            for obj in made:
                bpy.data.objects.remove(obj)


def build():
    k = Kit(seed=23)
    build_crew(k)
    build_helmets(k)
    build_jackets(k)
    build_trousers(k)
    build_hands_feet(k)

    joined = k.finish(OUT, alone=tuple(k.nodes), unit=UNIT)
    size = k.size
    count = {name: k.triangles([obj]) for name, obj in joined.items()}

    def most(base):
        return max(n for name, n in count.items() if name == base or name.startswith(base + "_"))

    pairs = sum(most(name) for name in ("upper_arm", "forearm", "thigh", "shin", "glove", "boot"))
    seated = most("torso") + count["hump"] + count["peak"] + count["backpack"] + count["neck"] + most("back") + most("helmet") + 2 * pairs
    print(f"rider as seated, at most: {seated} triangles; {sum(count.values())} in the file of {size} bytes")
    if seated > BUDGET:
        raise SystemExit(f"{OUT}: a seated rider of {seated} triangles is over the budget of {BUDGET}")
    if size > FILE:
        raise SystemExit(f"{OUT}: {size} bytes is over the budget of {FILE}")
    # Every node again, light, for the crew and for a rider far away (far.py)
    far.rider(OUT)
    preview(k, joined)


build()
