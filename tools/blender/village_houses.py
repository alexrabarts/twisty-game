# The houses of night-ride's village: five alpine houses, each one node of
# assets/village/houses.glb. A house stands on a plot 20 m long beside the
# road: its front is the plane z = 0 (the line a rider crashes on), x runs
# along the road with the house centred on 0, and it is 9 m deep. The ground
# behind the front climbs 7 m at once (js/terrain.js, streetSide), so only a
# house's front, its top floor and its roof show; all four sides are built
# all the same, because the houses at the village's ends show a flank.
#
#   blender --background --factory-startup --python tools/blender/village_houses.py
#
# Set TWISTY_PREVIEW=<directory> for a render of each house.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common
from village_kit import Frame, Shape, finish, hexc, scale

SEED = 4021
BUDGET = 9000
DEPTH = 9.0

TIMBER = hexc(0x7A5638)
TIMBER_DARK = hexc(0x4E3626)
TIMBER_OLD = hexc(0x5E4733)
STONE = hexc(0x85817A)
STONE_LIGHT = hexc(0xB5AFA4)
RUBBLE = hexc(0x7F7A70)
SLATE = hexc(0x5E6066)
SHINGLE = hexc(0x6A4E38)
TILE = hexc(0x8A4A34)
CREAM = hexc(0xEFE8D8)
IRON = hexc(0x1E1E22)
PAINT = hexc(0xF0F0F0)
FLOWERS = [hexc(0xC8242C), hexc(0xC8242C), hexc(0xDC5074), hexc(0xECE6DA), hexc(0x447A30), hexc(0x386A28)]
LAMP = (1.0, 0.74, 0.42)


def plaster(sh):
    def colour(p):
        g = 0.82 + 0.13 * sh.noise(p, 2.6) + 0.06 * sh.noise(p, 0.6)
        # Splash and damp darken the first metre
        g -= 0.14 * max(0.0, 1.0 - p.y / 1.1)
        return (g, g, g * 0.985)
    return colour


def clad(sh, f, s0, s1, y0, y1, kind, top=None, breaks=(), coarse=False):
    """One storey of a wall, or a gable (top is its line), in the named cladding."""
    line = top or (lambda s: y1)
    low = lambda s: y0
    if kind == "plaster":
        sh.region(f, s0, s1, y0, line, plaster(sh), tag="wall", cell=3.0 if coarse else 1.5, breaks=breaks, bottom=low)
    elif kind == "boards":
        sh.region(f, s0, s1, y0, line, lambda i, r, c: sh.jitter(TIMBER, 0.14, 0.04), d=0.03, cell=1.5 if coarse else 0.3, breaks=breaks, rows=1, bottom=low)
    elif kind == "logs":
        shades = {}
        count = max(1, round((y1 - y0) / 0.29))
        tint = lambda i, r, c: scale(shades.setdefault(r, sh.jitter(TIMBER, 0.13, 0.04)), sh.rng.uniform(0.96, 1.04))
        sh.region(f, s0, s1, y0, line, tint, d=0.03, cell=3.0 if coarse else 1.6, breaks=breaks, rows=lambda i: count, bottom=low)
    elif kind == "stone":
        sh.courses(f, s0, s1, y0, y1, RUBBLE, d=0.03, course=0.36, stone=(0.4, 0.95) if not coarse else (2.0, 3.0), vary=0.2)
    else:
        raise SystemExit(f"no cladding named {kind}")


def window(sh, f, s, y, w=1.0, h=1.35, shutters=True, box=False, frame=CREAM, sill=True):
    """A window on a wall, its sill at height y: glass, frame, glazing bars, sill, shutters, flower box."""
    index = sh.windows
    sh.windows += 1
    a, b = s - w / 2, s + w / 2
    glow = lambda ss, yy: 1.0 - 0.42 * abs(ss - s) / (w / 2) - 0.14 * (yy - y) / h
    for s0, s1 in ((a, s), (s, b)):
        for y0, y1 in ((y, y + h / 2), (y + h / 2, y + h)):
            corners = [(s0, y0), (s1, y0), (s1, y1), (s0, y1)]
            sh.face([f.p(ss, yy, 0.035) for ss, yy in corners], [(index / 255, glow(ss, yy), 0.0) for ss, yy in corners], f.out, "glass")
    t = 0.09
    sh.fbox(f, (a - t, a), (y - t, y + h + t), (0.0, 0.1), frame, skip=("back", "top", "bottom"))
    sh.fbox(f, (b, b + t), (y - t, y + h + t), (0.0, 0.1), frame, skip=("back", "top", "bottom"))
    sh.fbox(f, (a, b), (y + h, y + h + t), (0.0, 0.1), frame, skip=("back", "left", "right", "top"))
    sh.fbox(f, (a, b), (y - t, y), (0.0, 0.1), frame, skip=("back", "left", "right", "bottom"))
    bar = 0.028
    sh.face([f.p(s - bar, y, 0.06), f.p(s + bar, y, 0.06), f.p(s + bar, y + h, 0.06), f.p(s - bar, y + h, 0.06)], frame, f.out)
    sh.face([f.p(a, y + h / 2 - bar, 0.06), f.p(b, y + h / 2 - bar, 0.06), f.p(b, y + h / 2 + bar, 0.06), f.p(a, y + h / 2 + bar, 0.06)], frame, f.out)
    if sill:
        sh.fbox(f, (a - 0.16, b + 0.16), (y - t - 0.09, y - t), (0.0, 0.2), STONE_LIGHT, skip=("back",))
    if shutters:
        panel = w / 2 + 0.03
        for side, (p0, p1) in (("left", (a - t - panel, a - t)), ("right", (b + t, b + t + panel))):
            boards = 3
            for n in range(boards):
                q0, q1 = p0 + (p1 - p0) * n / boards, p0 + (p1 - p0) * (n + 1) / boards
                sh.face([f.p(q0, y - 0.03, 0.055), f.p(q1, y - 0.03, 0.055), f.p(q1, y + h + 0.03, 0.055), f.p(q0, y + h + 0.03, 0.055)],
                        sh.jitter(PAINT, 0.07), f.out, "shutter")
            edge = p0 if side == "left" else p1
            sh.face([f.p(edge, y - 0.03, 0.0), f.p(edge, y - 0.03, 0.055), f.p(edge, y + h + 0.03, 0.055), f.p(edge, y + h + 0.03, 0.0)],
                    scale(PAINT, 0.8), f.along * (-1 if side == "left" else 1), "shutter")
            for at in (0.16, 0.8):
                yy = y + h * at
                sh.face([f.p(p0, yy, 0.07), f.p(p1, yy, 0.07), f.p(p1, yy + 0.1, 0.07), f.p(p0, yy + 0.1, 0.07)], scale(PAINT, 0.72), f.out, "shutter")
    if box:
        flowers(sh, f, a - 0.08, b + 0.08, y - t - 0.36, 0.02)


def flowers(sh, f, s0, s1, y, d):
    """A timber box of geraniums, its foot at height y."""
    sh.fbox(f, (s0, s1), (y, y + 0.24), (d, d + 0.3), TIMBER_DARK, skip=("back", "top"))
    count = max(3, round((s1 - s0) / 0.22))
    for n in range(count):
        c = s0 + (s1 - s0) * (n + 0.5) / count
        r = sh.rng.uniform(0.09, 0.14)
        lift = sh.rng.uniform(0.08, 0.24)
        sh.fbox(f, (c - r, c + r), (y + 0.2, y + 0.24 + lift), (d + 0.04, d + 0.3 + sh.rng.uniform(0.0, 0.1)), sh.rng.choice(FLOWERS), skip=("back", "bottom"), vary=0.12)


def lantern(sh, f, s, y, d=0.12):
    """A small lit lantern on a bracket."""
    sh.fbox(f, (s - 0.025, s + 0.025), (y + 0.3, y + 0.34), (0.0, d + 0.2), IRON, skip=("back",))
    sh.fbox(f, (s - 0.11, s + 0.11), (y + 0.24, y + 0.3), (d - 0.03, d + 0.25), IRON, skip=())
    sh.fbox(f, (s - 0.08, s + 0.08), (y, y + 0.24), (d, d + 0.2), LAMP, tag="lamp", skip=("top",))
    sh.fbox(f, (s - 0.1, s + 0.1), (y - 0.04, y), (d - 0.02, d + 0.22), IRON)


def door(sh, f, s, w=1.15, h=2.15, y=0.0, lit=True, surround=STONE_LIGHT, leaf=TIMBER_DARK, step=True, boards=5):
    """A boarded door in a stone surround, a step under it and a lantern beside it."""
    a, b = s - w / 2, s + w / 2
    for n in range(boards):
        q0, q1 = a + w * n / boards, a + w * (n + 1) / boards
        sh.face([f.p(q0, y, 0.04), f.p(q1, y, 0.04), f.p(q1, y + h, 0.04), f.p(q0, y + h, 0.04)], sh.jitter(leaf, 0.12, 0.03), f.out)
    for at in (0.2, 0.75):
        sh.fbox(f, (a, b), (y + h * at, y + h * at + 0.12), (0.04, 0.07), scale(leaf, 0.75), skip=("back", "left", "right"))
    sh.fbox(f, (b - 0.22, b - 0.14), (y + 1.0, y + 1.14), (0.04, 0.11), IRON, skip=("back",))
    j = 0.2
    sh.fbox(f, (a - j, a), (y, y + h), (0.0, 0.15), surround, skip=("back", "bottom", "top"), vary=0.05)
    sh.fbox(f, (b, b + j), (y, y + h), (0.0, 0.15), surround, skip=("back", "bottom", "top"), vary=0.05)
    sh.fbox(f, (a - j - 0.06, b + j + 0.06), (y + h, y + h + 0.3), (0.0, 0.18), surround, skip=("back",), vary=0.05)
    if step:
        sh.fbox(f, (a - 0.35, b + 0.35), (-0.5, y if y > 0.05 else 0.14), (0.0, 0.5), STONE, skip=("back", "bottom"), vary=0.05)
    if lit:
        lantern(sh, f, b + j + 0.4, y + h - 0.25)


def barn_door(sh, f, s, w=2.8, h=2.9, y=0.0):
    """Two boarded leaves with braces, on strap hinges."""
    a, b = s - w / 2, s + w / 2
    boards = 12
    for n in range(boards):
        q0, q1 = a + w * n / boards, a + w * (n + 1) / boards
        sh.face([f.p(q0, y, 0.04), f.p(q1, y, 0.04), f.p(q1, y + h, 0.04), f.p(q0, y + h, 0.04)], sh.jitter(TIMBER_OLD, 0.15, 0.04), f.out)
    for l0, l1 in ((a, s - 0.02), (s + 0.02, b)):
        for yy in (y + 0.25, y + h - 0.37):
            sh.fbox(f, (l0, l1), (yy, yy + 0.14), (0.04, 0.08), TIMBER_DARK, skip=("back", "left", "right"))
        low, high = (l0, l1) if l0 < s else (l1, l0)
        sh.beam(f.p(low, y + 0.39, 0.06), f.p(high, y + h - 0.37, 0.06), (0.04, 0.14), TIMBER_DARK, ends=False)
    sh.fbox(f, (a - 0.22, a), (y, y + h + 0.24), (0.0, 0.12), TIMBER_DARK, skip=("back", "bottom"))
    sh.fbox(f, (b, b + 0.22), (y, y + h + 0.24), (0.0, 0.12), TIMBER_DARK, skip=("back", "bottom"))
    sh.fbox(f, (a, b), (y + h, y + h + 0.24), (0.0, 0.14), TIMBER_DARK, skip=("back", "left", "right"))


def balcony(sh, f, s0, s1, y, braces, depth=1.0, rail=1.0, boxes=True, posts=None):
    """A timber balcony: deck on braces (at the places `braces`, clear of the
    windows below), a rail of flat balusters, flower boxes. `posts` is the height its corner posts reach."""
    sh.fbox(f, (s0, s1), (y - 0.12, y), (0.0, depth), TIMBER, skip=("back",), vary=0.06)
    for s in braces:
        sh.fbox(f, (s - 0.06, s + 0.06), (y - 0.28, y - 0.12), (0.0, depth - 0.04), TIMBER_DARK, skip=("back", "top"))
        sh.beam(f.p(s, y - 0.75, 0.03), f.p(s, y - 0.26, depth - 0.2), (0.1, 0.12), TIMBER_DARK, ends=False)
    sh.fbox(f, (s0, s1), (y + rail - 0.09, y + rail), (depth - 0.12, depth), TIMBER_DARK, skip=())
    sh.fbox(f, (s0, s1), (y + 0.08, y + 0.15), (depth - 0.1, depth - 0.02), TIMBER_DARK, skip=("left", "right"))
    pitch = 0.27
    slats = max(1, round((s1 - s0) / pitch))
    for n in range(slats):
        c = s0 + (s1 - s0) * (n + 0.5) / slats
        tint = sh.jitter(TIMBER, 0.14, 0.04)
        for d, out in ((depth - 0.05, f.out), (depth - 0.09, -f.out)):
            sh.face([f.p(c - 0.085, y + 0.15, d), f.p(c + 0.085, y + 0.15, d), f.p(c + 0.085, y + rail - 0.09, d), f.p(c - 0.085, y + rail - 0.09, d)], tint, out)
    for s, name in ((s0, "left"), (s1, "right")):
        e0, e1 = (s, s + 0.05) if name == "left" else (s - 0.05, s)
        sh.fbox(f, (e0, e1), (y + 0.08, y + rail - 0.09), (0.0, depth - 0.1), TIMBER, skip=("top", "bottom", "back", "front"))
        if posts:
            p0, p1 = (s, s + 0.13) if name == "left" else (s - 0.13, s)
            sh.fbox(f, (p0, p1), (y, posts), (depth - 0.13, depth), TIMBER_DARK, skip=("top", "bottom"))
    if boxes:
        count = max(1, round((s1 - s0) / 3.2))
        for n in range(count):
            c = s0 + (s1 - s0) * (n + 0.5) / count
            flowers(sh, f, c - 0.75, c + 0.75, y + rail - 0.3, depth)


def chimney(sh, x, z, y0, y1, w=0.75, d=0.62):
    sh.region(Frame((x - w / 2, 0, z - d / 2), (1, 0, 0), (0, 0, -1)), 0, w, y0, lambda s: y1, plaster(sh), tag="wall", cell=2)
    sh.region(Frame((x - w / 2, 0, z + d / 2), (1, 0, 0), (0, 0, 1)), 0, w, y0, lambda s: y1, plaster(sh), tag="wall", cell=2)
    sh.region(Frame((x - w / 2, 0, z - d / 2), (0, 0, 1), (-1, 0, 0)), 0, d, y0, lambda s: y1, plaster(sh), tag="wall", cell=2)
    sh.region(Frame((x + w / 2, 0, z - d / 2), (0, 0, 1), (1, 0, 0)), 0, d, y0, lambda s: y1, plaster(sh), tag="wall", cell=2)
    sh.box((x - w / 2 - 0.08, y1, z - d / 2 - 0.08), (x + w / 2 + 0.08, y1 + 0.1, z + d / 2 + 0.08), STONE)
    for dx in (-0.16, 0.16):
        sh.box((x + dx - 0.1, y1 + 0.1, z - 0.1), (x + dx + 0.1, y1 + 0.34, z + 0.1), scale(TILE, 0.8), skip=("-y",))
    sh.box((x - w / 2 - 0.12, y1 + 0.34, z - d / 2 - 0.12), (x + w / 2 + 0.12, y1 + 0.42, z + d / 2 + 0.12), STONE, vary=0.05)


def shell(name, seed, width, plinth, floors, pitch, ridge, roof, eaves=1.0, verge=0.9, gable=None, tile=(0.62, 0.48)):
    """The walls and roof of a house. `floors` is (height, cladding) from the
    ground up; `ridge` is "z" for a gable to the street or "x" for eaves to it."""
    sh = Shape(name, seed)
    w, D = width, DEPTH
    levels = [plinth]
    for height, _ in floors:
        levels.append(levels[-1] + height)
    eave = levels[-1]
    tan = math.tan(math.radians(pitch))
    cos, sin = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
    frames = {
        "front": Frame((-w / 2, 0, 0), (1, 0, 0), (0, 0, -1)),
        "back": Frame((-w / 2, 0, D), (1, 0, 0), (0, 0, 1)),
        "left": Frame((-w / 2, 0, 0), (0, 0, 1), (-1, 0, 0)),
        "right": Frame((w / 2, 0, 0), (0, 0, 1), (1, 0, 0)),
    }
    lengths = {"front": w, "back": w, "left": D, "right": D}
    gabled = ("front", "back") if ridge == "z" else ("left", "right")
    for side, f in frames.items():
        L = lengths[side]
        coarse = side == "back"
        sh.courses(f, 0, L, -0.6, plinth, STONE, d=0.05, course=0.32, stone=(0.45, 1.1) if not coarse else (2.0, 3.0))
        for k, (height, kind) in enumerate(floors):
            clad(sh, f, 0, L, levels[k], levels[k + 1], kind, coarse=coarse)
            if k and floors[k - 1][1] != kind and not coarse:
                sh.fbox(f, (-0.04, L + 0.04), (levels[k] - 0.1, levels[k] + 0.08), (0.0, 0.09), TIMBER_DARK, skip=("back",))
        if side in gabled:
            line = lambda s, L=L: eave + (L / 2 - abs(s - L / 2)) * tan
            clad(sh, f, 0, L, eave, None, gable or floors[-1][1], top=line, breaks=(L / 2,), coarse=coarse)
    under = scale(TIMBER, 0.8)
    if ridge == "z":
        top = eave + w / 2 * tan
        run = (w / 2 + eaves) / cos
        length = D + verge + 0.5
        sh.slab((-w / 2 - eaves, eave - eaves * tan, -verge), (0, 0, 1), (cos, sin, 0), length, run, roof, soffit=under, tile=tile)
        sh.slab((w / 2 + eaves, eave - eaves * tan, -verge), (0, 0, 1), (-cos, sin, 0), length, run, roof, soffit=under, tile=tile)
        sh.box((-0.14, top - 0.02, -verge - 0.02), (0.14, top + 0.1, D + 0.52), scale(roof, 0.8), skip=("-y",))
        # Bargeboards on the street gable, and the purlins that carry the verge
        for sign in (-1, 1):
            sh.beam((sign * (w / 2 + eaves), eave - eaves * tan - 0.1, -verge - 0.03), (0, top - 0.1, -verge - 0.03), (0.07, 0.3), TIMBER_DARK)
        for x in (-w / 2 + 0.1, -w / 4, 0, w / 4, w / 2 - 0.1):
            y = eave + (w / 2 - abs(x)) * tan - 0.3
            sh.box((x - 0.1, y, -verge + 0.06), (x + 0.1, y + 0.2, 0.0), TIMBER_DARK, skip=("+z",))
    else:
        top = eave + D / 2 * tan
        run = (D / 2 + eaves) / cos
        length = w + 2 * verge
        sh.slab((-w / 2 - verge, eave - eaves * tan, -eaves), (1, 0, 0), (0, sin, cos), length, run, roof, soffit=under, tile=tile)
        sh.slab((-w / 2 - verge, eave - eaves * tan, D + eaves), (1, 0, 0), (0, sin, -cos), length, run, roof, soffit=under, tile=tile, plain=True)
        sh.box((-w / 2 - verge - 0.02, top - 0.02, D / 2 - 0.14), (w / 2 + verge + 0.02, top + 0.1, D / 2 + 0.14), scale(roof, 0.8), skip=("-y",))
        for sign in (-1, 1):
            x = sign * (w / 2 + verge + 0.03)
            sh.beam((x, eave - eaves * tan - 0.1, -eaves), (x, top - 0.1, D / 2), (0.07, 0.3), TIMBER_DARK)
            sh.beam((x, eave - eaves * tan - 0.1, D + eaves), (x, top - 0.1, D / 2), (0.07, 0.3), TIMBER_DARK)
        # Rafter feet under the street eave
        count = round(w / 1.1)
        for n in range(count + 1):
            x = -w / 2 + 0.1 + (w - 0.2) * n / count
            sh.beam((x, eave - 0.2, 0.0), (x, eave - eaves * tan - 0.2, -eaves + 0.08), (0.1, 0.16), TIMBER_DARK)
    sh.anchor("left", (-w / 2, 0, 0))
    sh.anchor("right", (w / 2, 0, 0))
    return sh, frames, levels, top


def corner_logs(sh, w, y0, y1):
    """The crossed log ends at the street corners of a log-built storey."""
    f = Frame((-w / 2, 0, 0), (1, 0, 0), (0, 0, -1))
    count = round((y1 - y0) / 0.29)
    for row in range(0, count, 2):
        a = y0 + (y1 - y0) * row / count
        b = y0 + (y1 - y0) * (row + 1) / count
        for s0, s1 in ((-0.2, 0.06), (w - 0.06, w + 0.2)):
            sh.fbox(f, (s0, s1), (a + 0.02, b - 0.02), (-0.2, 0.2), TIMBER_DARK, skip=("back",), vary=0.1)


def chalet():
    """Three storeys under a low wide gable: plastered ground floor, two log floors with balconies."""
    w = 13.0
    sh, frames, levels, top = shell("house_chalet", SEED + 1, w, 0.5, [(2.9, "plaster"), (2.6, "logs"), (2.6, "logs")], 21, "z", SLATE, eaves=1.3, verge=1.25, gable="boards", tile=(0.8, 0.58))
    f = frames["front"]
    door(sh, f, 2.6, y=0.14)
    for s in (5.6, 8.0, 10.6):
        window(sh, f, s, levels[0] + 0.85, shutters=True)
    corner_logs(sh, w, levels[1], levels[3])
    balcony(sh, f, 0.5, w - 0.5, levels[1] + 0.1, (0.7, 4.4, 6.8, 9.3, 12.3), posts=levels[2])
    for s in (2.2, 4.9, 8.1, 10.8):
        window(sh, f, s, levels[1] + 1.05, w=0.95, h=1.25)
    balcony(sh, f, 2.4, w - 2.4, levels[2] + 0.1, (3.55, 6.5, 9.45), depth=0.9)
    for s in (4.0, 6.5, 9.0):
        window(sh, f, s, levels[2] + 1.05, w=0.9, h=1.2)
    window(sh, f, w / 2, levels[3] + 0.5, w=0.8, h=0.9, shutters=False)
    for side in ("left", "right"):
        for s in (2.0, 5.2):
            window(sh, frames[side], s, levels[2] + 1.05, w=0.9, h=1.2)
    chimney(sh, -2.6, 5.8, levels[3], top + 0.55)
    return sh


def farmhouse():
    """Two plastered storeys with their eaves to the street, and a gabled bay over the door."""
    w = 14.5
    sh, frames, levels, top = shell("house_farm", SEED + 2, w, 0.6, [(3.0, "plaster"), (2.9, "plaster")], 37, "x", SLATE, eaves=0.85, verge=0.7, gable="boards")
    f = frames["front"]
    eave = levels[2]
    # The bay: the wall carried up past the eave under a small roof of its own
    half, pitch = 2.3, math.radians(40)
    c = w / 2
    peak = eave + 1.1 + half * math.tan(pitch)
    bay = Frame((-w / 2, 0, -0.02), (1, 0, 0), (0, 0, -1))
    sh.region(bay, c - half, c + half, eave - 0.2, lambda s: eave + 1.1 + (half - abs(s - c)) * math.tan(pitch), plaster(sh), tag="wall", cell=1.2, breaks=(c,), bottom=lambda s: eave - 0.2)
    for sign in (-1, 1):
        x = sign * half
        sh.region(Frame((x, 0, -0.02), (0, 0, 1), (sign, 0, 0)), 0, 3.4, eave - 0.6, lambda s: eave + 1.1, plaster(sh), tag="wall", cell=2, bottom=lambda s: eave - 0.6)
        over = 0.45
        run = (half + over) / math.cos(pitch)
        sh.slab((sign * (half + over), eave + 1.1 - over * math.tan(pitch), -0.55), (0, 0, 1), (-sign * math.cos(pitch), math.sin(pitch), 0), 4.6, run, SLATE, soffit=scale(TIMBER, 0.8), thick=0.12)
        sh.beam((sign * (half + over), eave + 1.1 - over * math.tan(pitch) - 0.08, -0.58), (0, peak - 0.08, -0.58), (0.06, 0.24), TIMBER_DARK)
    window(sh, f, c, eave + 0.2, w=1.0, h=1.3, shutters=True)
    door(sh, f, c, w=1.25, h=2.2, y=0.16)
    for s in (1.7, 4.4, 10.1, 12.8):
        window(sh, f, s, levels[0] + 1.0, box=s in (4.4, 10.1))
        window(sh, f, s, levels[1] + 0.95, box=s in (1.7, 12.8))
    window(sh, f, c, levels[1] + 0.95, box=True)
    for side in ("left", "right"):
        window(sh, frames[side], DEPTH / 2, levels[2] + 0.9, w=0.85, h=1.1)
        for s in (2.2, 6.6):
            window(sh, frames[side], s, levels[1] + 0.95)
    chimney(sh, -4.4, DEPTH / 2 + 0.9, levels[2] + 1.6, top + 0.7)
    chimney(sh, 4.9, DEPTH / 2 - 1.0, levels[2] + 1.6, top + 0.6, w=0.6)
    return sh


def inn():
    """The tall house of the street: three plastered storeys, dressed corners, a wide door and a sign."""
    w = 13.5
    sh, frames, levels, top = shell("house_inn", SEED + 3, w, 0.7, [(3.2, "plaster"), (2.8, "plaster"), (2.7, "plaster")], 31, "z", TILE, eaves=0.9, verge=0.8, gable="boards", tile=(0.6, 0.5))
    f = frames["front"]
    # Dressed stones up both street corners, long and short by turns
    count = round((levels[3] - 0.7) / 0.42)
    for row in range(count):
        a = 0.7 + (levels[3] - 0.7) * row / count
        b = 0.7 + (levels[3] - 0.7) * (row + 1) / count
        reach = 0.75 if row % 2 else 0.45
        sh.fbox(f, (-0.03, reach), (a + 0.015, b - 0.015), (0.0, 0.05), STONE_LIGHT, skip=("back",), vary=0.07)
        sh.fbox(f, (w - reach, w + 0.03), (a + 0.015, b - 0.015), (0.0, 0.05), STONE_LIGHT, skip=("back",), vary=0.07)
    door(sh, f, w / 2, w=1.7, h=2.5, y=0.16, boards=7)
    lantern(sh, f, w / 2 - 1.5, 2.35)
    for s in (2.3, 4.5, 9.0, 11.2):
        window(sh, f, s, levels[0] + 1.05, w=1.05, h=1.5)
    for k in (1, 2):
        for s in (2.3, 4.5, 6.75, 9.0, 11.2):
            window(sh, f, s, levels[k] + 0.9, w=1.0, h=1.4, box=(k == 1 and s in (4.5, 9.0)))
    for s in (5.4, 8.1):
        window(sh, f, s, levels[3] + 0.6, w=0.8, h=1.0, shutters=False)
    sh.fbox(f, (-0.03, w + 0.03), (levels[1] - 0.12, levels[1] + 0.08), (0.0, 0.08), STONE_LIGHT, skip=("back",))
    # The sign: an iron bracket and a painted board hung from it, a lamp over it
    s = 1.0
    sh.fbox(f, (s - 0.03, s + 0.03), (levels[1] + 1.52, levels[1] + 1.58), (0.0, 1.3), IRON, skip=("back",))
    sh.beam(f.p(s, levels[1] + 0.8, 0.02), f.p(s, levels[1] + 1.5, 0.9), (0.04, 0.04), IRON, ends=False)
    sign = Frame(f.p(s, 0, 0.3), (0, 0, -1), (-1, 0, 0))
    sh.fbox(sign, (0.0, 0.9), (levels[1] + 0.62, levels[1] + 1.38), (-0.03, 0.03), hexc(0x6E1F1F), skip=())
    sh.fbox(sign, (0.12, 0.78), (levels[1] + 0.86, levels[1] + 1.14), (-0.04, 0.04), hexc(0xD9B45A), skip=("top", "bottom"))
    lamp = Frame(f.p(s - 0.1, 0, 0.0), (1, 0, 0), (0, 0, -1))
    sh.fbox(lamp, (0.02, 0.18), (levels[1] + 1.62, levels[1] + 1.84), (1.05, 1.21), LAMP, tag="lamp", skip=("bottom",))
    for side in ("left", "right"):
        for s in (2.2, 5.4):
            window(sh, frames[side], s, levels[2] + 0.9, w=1.0, h=1.4)
    chimney(sh, 3.4, 6.2, levels[3] + 0.6, top + 0.5)
    chimney(sh, -3.6, 3.0, levels[3] + 0.5, top + 0.4, w=0.6)
    return sh


def barn():
    """A barn made a house: stone below, boards above, a wagon door, a hay door under the eave and a woodpile."""
    w = 15.0
    sh, frames, levels, top = shell("house_barn", SEED + 4, w, 0.4, [(3.2, "stone"), (3.3, "boards")], 29, "x", SHINGLE, eaves=1.35, verge=0.9, gable="boards", tile=(0.55, 0.46))
    f = frames["front"]
    barn_door(sh, f, 4.0, y=0.05)
    lantern(sh, f, 6.1, 2.3)
    door(sh, f, 10.6, w=1.05, h=2.05, y=0.14, lit=False, surround=STONE)
    for s in (8.4, 12.8):
        window(sh, f, s, levels[0] + 1.3, w=0.85, h=1.0, shutters=False)
    # The hay door, and the beam its hoist hung from
    a, b = 3.2, 4.8
    for n in range(6):
        q0, q1 = a + (b - a) * n / 6, a + (b - a) * (n + 1) / 6
        sh.face([f.p(q0, levels[1] + 0.5, 0.06), f.p(q1, levels[1] + 0.5, 0.06), f.p(q1, levels[1] + 2.3, 0.06), f.p(q0, levels[1] + 2.3, 0.06)], sh.jitter(TIMBER_OLD, 0.15), f.out)
    sh.fbox(f, (a - 0.12, b + 0.12), (levels[1] + 2.3, levels[1] + 2.44), (0.03, 0.1), TIMBER_DARK, skip=("back",))
    sh.fbox(f, (a - 0.12, b + 0.12), (levels[1] + 0.38, levels[1] + 0.5), (0.03, 0.1), TIMBER_DARK, skip=("back",))
    sh.fbox(f, (3.9, 4.1), (levels[2] - 0.42, levels[2] - 0.22), (0.0, 1.15), TIMBER_DARK, skip=("back",))
    for s in (7.6, 10.2, 12.8):
        window(sh, f, s, levels[1] + 1.0, w=0.9, h=1.15, box=s == 10.2)
    # Firewood stacked against the wall: every log end its own face
    s0, s1, rows = 6.9, 9.6, 5
    for row in range(rows):
        s = s0 + (0.11 if row % 2 else 0.0)
        while s < s1 - 0.1:
            e = min(s1, s + sh.rng.uniform(0.18, 0.27))
            sh.fbox(f, (s + 0.01, e - 0.01), (0.02 + row * 0.22, 0.02 + row * 0.22 + 0.2), (0.05, 0.42 + sh.rng.uniform(0, 0.08)),
                    sh.jitter(hexc(0xB08A58), 0.2, 0.05), skip=("back", "left", "right", "bottom") if row < rows - 1 else ("back", "left", "right", "bottom"))
            s = e
    sh.fbox(f, (s0 - 0.02, s0 + 0.01), (0.0, rows * 0.22), (0.05, 0.42), TIMBER_OLD, skip=("back", "right", "bottom"))
    sh.fbox(f, (s1 - 0.01, s1 + 0.02), (0.0, rows * 0.22), (0.05, 0.42), TIMBER_OLD, skip=("back", "left", "bottom"))
    for side in ("left", "right"):
        window(sh, frames[side], DEPTH / 2, levels[2] + 0.5, w=0.8, h=1.0, shutters=False)
        window(sh, frames[side], 2.4, levels[1] + 1.0, w=0.9, h=1.15)
    chimney(sh, 3.0, DEPTH / 2 + 1.2, levels[2] + 1.2, top + 0.6)
    return sh


def cottage():
    """A narrow house under a steep roof: plaster, a boarded upper floor with a balcony, two windows in the gable."""
    w = 11.0
    sh, frames, levels, top = shell("house_cottage", SEED + 5, w, 0.55, [(2.9, "plaster"), (2.7, "boards")], 40, "z", SHINGLE, eaves=0.8, verge=1.0, gable="boards", tile=(0.55, 0.46))
    f = frames["front"]
    door(sh, f, 8.3, y=0.15)
    for s in (2.0, 4.6):
        window(sh, f, s, levels[0] + 0.85, box=True)
    balcony(sh, f, 0.6, w - 0.6, levels[1] + 0.1, (0.75, 3.3, 6.3, 10.25), depth=0.95)
    for s in (2.4, 5.5, 8.6):
        window(sh, f, s, levels[1] + 1.0, w=0.95, h=1.3)
    for s in (4.0, 7.0):
        window(sh, f, s, levels[2] + 0.75, w=0.9, h=1.2, box=True)
    window(sh, f, w / 2, levels[2] + 3.2, w=0.7, h=0.8, shutters=False)
    for side in ("left", "right"):
        window(sh, frames[side], 2.4, levels[1] + 1.0, w=0.95, h=1.3)
    chimney(sh, 2.4, 5.0, levels[2] + 1.6, top + 0.5)
    return sh


def main():
    common.reset(SEED)
    shapes = [chalet(), farmhouse(), inn(), barn(), cottage()]
    for shape in shapes:
        if shape.windows > 255:
            raise SystemExit(f"{shape.name}: {shape.windows} windows do not fit a byte")
    finish(os.path.join(common.ASSETS, "village", "houses.glb"), shapes, SEED, BUDGET)


main()
