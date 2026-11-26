# The street furniture of night-ride's village, each one node of
# assets/village/props.glb: a lamp post, and four sections of the garden wall
# that stands between two houses. The ground behind the house fronts climbs
# 7 m at once (js/terrain.js, streetSide), so the garden wall is a retaining
# wall that high, with the garden's fence and hedge on top of it.
#
# A wall section is 3 m long (x from 0 to 3), its face on z = 0 as a house
# front is; the game lays sections end to end and stretches them a little to
# fill a gap. The lamp post stands on its own origin and reaches toward the
# road (-z).
#
#   blender --background --factory-startup --python tools/blender/village_props.py
#
# Set TWISTY_PREVIEW=<directory> for a render of each.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common
from village_kit import Frame, Shape, finish, hexc, scale

SEED = 5077
BUDGET = 1200
SECTION = 3.0
HEIGHT = 7.1

STONE = hexc(0x7E7A72)
COPING = hexc(0x9A958B)
TIMBER = hexc(0x6E5038)
TIMBER_DARK = hexc(0x4A3324)
IRON = hexc(0x1C1C20)
HEDGE = hexc(0x2F5527)
IVY = hexc(0x3A6630)
WATER = hexc(0x2A4650)
LAMP = (1.0, 0.74, 0.42)


def wall(name, seed, pier=True, ivy=True):
    sh = Shape(name, seed)
    f = Frame((0, 0, 0), (1, 0, 0), (0, 0, -1))
    sh.courses(f, 0, SECTION, -0.6, HEIGHT, STONE, course=0.37, stone=(0.4, 0.9), vary=0.2)
    # Coping stones, and the garden's fence and hedge behind them
    s = 0.0
    while s < SECTION - 1e-6:
        e = min(SECTION, s + sh.rng.uniform(0.6, 0.95))
        if SECTION - e < 0.4:
            e = SECTION
        sh.fbox(f, (s, e), (HEIGHT, HEIGHT + 0.17), (-0.5, 0.09), sh.jitter(COPING, 0.1), skip=("back", "bottom", "left", "right"))
        s = e
    for s in (0.0, SECTION / 2):
        sh.fbox(f, (s + 0.02, s + 0.14), (HEIGHT + 0.17, HEIGHT + 1.3), (-0.24, -0.12), TIMBER_DARK, skip=("bottom",))
    for y in (HEIGHT + 0.42, HEIGHT + 1.05):
        sh.fbox(f, (0, SECTION), (y, y + 0.09), (-0.12, -0.08), TIMBER_DARK, skip=("left", "right"))
    slats = 13
    for n in range(slats):
        c = SECTION * (n + 0.5) / slats
        top = HEIGHT + 1.22 + sh.rng.uniform(-0.03, 0.03)
        tint = sh.jitter(TIMBER, 0.15, 0.04)
        points = [f.p(c - 0.08, HEIGHT + 0.25, -0.07), f.p(c + 0.08, HEIGHT + 0.25, -0.07), f.p(c + 0.08, top, -0.07), f.p(c, top + 0.08, -0.07), f.p(c - 0.08, top, -0.07)]
        sh.face(points, tint, f.out)
    s = 0.0
    while s < SECTION - 1e-6:
        e = min(SECTION, s + sh.rng.uniform(0.7, 1.2))
        if SECTION - e < 0.5:
            e = SECTION
        top = HEIGHT + sh.rng.uniform(1.25, 1.9)
        sh.fbox(f, (s, e), (HEIGHT - 0.1, top), (-1.5 - sh.rng.uniform(0, 0.4), -0.3 - sh.rng.uniform(0, 0.12)), sh.jitter(HEDGE, 0.2, 0.05), skip=("bottom",))
        s = e
    if pier:
        # A buttress, its top weathered to a slope
        a, b, top = 0.0, 0.62, 4.6
        sh.courses(Frame((a, 0, -0.34), (1, 0, 0), (0, 0, -1)), 0, b - a, -0.6, top, STONE, course=0.37, stone=(0.3, 0.62), vary=0.18)
        for x, out in ((a, (-1, 0, 0)), (b, (1, 0, 0))):
            sh.courses(Frame((x, 0, -0.34), (0, 0, 1), out), 0, 0.34, -0.6, top, STONE, course=0.37, stone=(0.34, 0.34), vary=0.18)
            sh.face([(x, top, -0.34), (x, top, 0), (x, top + 0.55, 0)], scale(STONE, 0.9), out)
        sh.face([(a, top, -0.34), (b, top, -0.34), (b, top + 0.55, 0), (a, top + 0.55, 0)], sh.jitter(COPING, 0.08), (0, 1, -1))
    if ivy:
        # Ivy over the coping: leaves in ragged falls, each a face of its own green
        for _ in range(3):
            c = sh.rng.uniform(0.7, SECTION - 0.3)
            fall = sh.rng.uniform(0.9, 2.6)
            y = HEIGHT + 0.2
            while y > HEIGHT - fall:
                reach = 0.5 * (1 - (HEIGHT - y) / (fall + 0.6)) + 0.12
                for _ in range(2):
                    s0 = c + sh.rng.uniform(-reach, reach)
                    w, h = sh.rng.uniform(0.2, 0.36), sh.rng.uniform(0.2, 0.34)
                    lo, hi = max(0.0, s0 - w / 2), min(SECTION, s0 + w / 2)
                    sh.face([f.p(lo, y - h, 0.03), f.p(hi, y - h, 0.035), f.p(hi, y, 0.1), f.p(lo, y, 0.1)], sh.jitter(IVY, 0.25, 0.06), f.out)
                y -= sh.rng.uniform(0.2, 0.3)
    sh.anchor("end", (SECTION, 0, 0))
    return sh, f


def gate():
    """A section with a cellar door under a stone arch."""
    sh, f = wall("wall_gate", SEED + 3, pier=False)
    c, half, h = 1.55, 0.7, 1.75
    boards = 6
    rise = lambda s: h + math.sqrt(max(0.0, half * half - (s - c) ** 2)) * 0.8
    for n in range(boards):
        a, b = c - half + 2 * half * n / boards, c - half + 2 * half * (n + 1) / boards
        tint = sh.jitter(TIMBER_DARK, 0.14, 0.04)
        sh.face([f.p(a, 0, 0.05), f.p(b, 0, 0.05), f.p(b, rise(b), 0.05), f.p(a, rise(a), 0.05)], tint, f.out)
    for at in (0.45, 1.35):
        sh.fbox(f, (c - half, c + half), (at, at + 0.1), (0.05, 0.08), IRON, skip=("back", "left", "right"))
    for s0, s1 in ((c - half - 0.24, c - half), (c + half, c + half + 0.24)):
        sh.courses(Frame((s0, 0, -0.16), (1, 0, 0), (0, 0, -1)), 0, s1 - s0, 0, h, COPING, course=0.44, stone=(0.24, 0.24), vary=0.08)
        sh.fbox(f, (s0, s1), (0, h), (0.0, 0.16), COPING, skip=("back", "front", "bottom", "top"))
    stones = 7
    for n in range(stones):
        t0, t1 = math.pi * n / stones, math.pi * (n + 1) / stones
        ring = lambda t, r: f.p(c - math.cos(t) * r, h + math.sin(t) * r * 0.8, 0.16)
        tint = sh.jitter(COPING, 0.1)
        sh.face([ring(t0, half), ring(t1, half), ring(t1, half + 0.28), ring(t0, half + 0.28)], tint, f.out)
        back = lambda p: p - f.out * 0.16
        sh.face([ring(t0, half + 0.28), ring(t1, half + 0.28), back(ring(t1, half + 0.28)), back(ring(t0, half + 0.28))], scale(tint, 0.85), (0, 1, 0))
        sh.face([ring(t0, half), ring(t1, half), back(ring(t1, half)), back(ring(t0, half))], scale(tint, 0.7), (0, -1, 0))
    sh.fbox(f, (c - half - 0.3, c + half + 0.3), (-0.5, 0.1), (0.0, 0.4), COPING, skip=("back", "bottom"), vary=0.05)
    return sh


def trough():
    """A section with the village's water trough against it: a spout in the wall, a stone basin."""
    sh, f = wall("wall_trough", SEED + 4, pier=False)
    a, b, top, out = 0.6, 2.5, 0.72, 0.85
    for name, s, d in (("front", (a, b), (out - 0.14, out)), ("left", (a, a + 0.14), (0.0, out - 0.14)), ("right", (b - 0.14, b), (0.0, out - 0.14))):
        sh.fbox(f, s, (-0.5, top), d, COPING, skip=("bottom", "back") if name == "front" else ("bottom", "back", "front"), vary=0.07)
    sh.face([f.p(a + 0.14, top - 0.1, 0.0), f.p(b - 0.14, top - 0.1, 0.0), f.p(b - 0.14, top - 0.1, out - 0.14), f.p(a + 0.14, top - 0.1, out - 0.14)],
            [scale(WATER, 0.8), scale(WATER, 0.8), scale(WATER, 1.25), scale(WATER, 1.25)], (0, 1, 0))
    sh.fbox(f, (1.3, 1.8), (top, 1.75), (0.0, 0.14), COPING, skip=("back", "bottom"), vary=0.05)
    sh.tube(f.p(1.55, 1.35, 0.12), f.p(1.55, 1.28, 0.5), 0.035, 0.03, IRON, sides=6)
    return sh


def lamp_post():
    """A cast-iron post with a lantern hung from an arm over the kerb."""
    sh = Shape("lamp_post", SEED + 5)
    sh.tube((0, -0.4, 0), (0, 0.55, 0), 0.17, 0.13, IRON)
    sh.tube((0, 0.55, 0), (0, 0.66, 0), 0.15, 0.09, scale(IRON, 1.3))
    sh.tube((0, 0.66, 0), (0, 4.75, 0), 0.075, 0.05, IRON)
    sh.tube((0, 4.75, 0), (0, 4.95, 0), 0.07, 0.0, IRON)
    reach = -0.95
    sh.beam((0, 4.62, 0.05), (0, 4.7, reach - 0.1), (0.05, 0.06), IRON)
    # The scroll under the arm
    points = [(0, 3.95, -0.05), (0, 4.3, -0.42), (0, 4.58, -0.5), (0, 4.6, -0.75)]
    for p, q in zip(points, points[1:]):
        sh.beam(p, q, (0.035, 0.04), IRON, ends=False)
    sh.beam((0, 4.66, reach), (0, 4.5, reach), (0.03, 0.03), IRON, ends=False)
    # The lantern: a cap, four panes narrowing to the foot, a bar up each corner
    top, foot, wide, narrow = 4.42, 4.02, 0.19, 0.12
    cap = [(-wide - 0.04, top, reach - wide - 0.04), (wide + 0.04, top, reach - wide - 0.04), (wide + 0.04, top, reach + wide + 0.04), (-wide - 0.04, top, reach + wide + 0.04)]
    for n in range(4):
        a, b = cap[n], cap[(n + 1) % 4]
        sh.face([a, b, (0, top + 0.16, reach)], IRON, ((a[0] + b[0]) / 2, 0.5, (a[2] + b[2]) / 2 - reach))
    sh.face(cap, IRON, (0, -1, 0))
    upper = [(-wide, top, reach - wide), (wide, top, reach - wide), (wide, top, reach + wide), (-wide, top, reach + wide)]
    lower = [(-narrow, foot, reach - narrow), (narrow, foot, reach - narrow), (narrow, foot, reach + narrow), (-narrow, foot, reach + narrow)]
    for n in range(4):
        m = (n + 1) % 4
        out = ((upper[n][0] + upper[m][0]) / 2, 0, (upper[n][2] + upper[m][2]) / 2 - reach)
        sh.face([lower[n], lower[m], upper[m], upper[n]], [scale(LAMP, 0.8), scale(LAMP, 0.8), LAMP, LAMP], out, "lamp")
        sh.beam(lower[n], upper[n], (0.025, 0.025), IRON, ends=False)
    sh.face(lower, scale(LAMP, 0.7), (0, -1, 0), "lamp")
    sh.box((-0.04, foot - 0.07, reach - 0.04), (0.04, foot, reach + 0.04), IRON, skip=("+y",))
    sh.anchor("light", (0, (top + foot) / 2, reach))
    return sh


def main():
    common.reset(SEED)
    shapes = [wall("wall_plain", SEED + 1, pier=False)[0], wall("wall_pier", SEED + 2, ivy=False)[0], gate(), trough(), lamp_post()]
    finish(os.path.join(common.ASSETS, "village", "props.glb"), shapes, SEED, BUDGET, reach=1.0)


main()
