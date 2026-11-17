# The stone bridge of Mountain Dawn's riverside wood (leg 1), one node of
# assets/bridge/stone.glb: bridge_span. A single segmental arch over the
# river gully, masonry spandrel walls, a ring of voussoirs proud of the face,
# a string course at the deck, parapets with coping stones, and the arch
# barrel under the deck. Every stone is a face of its own shade (the village
# kit's way): the masonry has grain with no photo texture that could repeat.
#
# The bridge is modelled in its own frame, in the game's axes: x across the
# road (the parapets' inner faces at x = -10.9 and 10.9, the road 20 m wide
# with a 0.9 m shoulder), y up from the deck, z along the road, centred on
# z = 0 and 60 m long (positions are packed to 32.767 m from the origin). The game (js/sceneassets.js, dressBridge) stretches it
# to its span and to the leg's road width. The gully's bed is 8.6 m down
# (js/terrain.js, bridgeSide): the walls stand on it.
#
#   blender --background --factory-startup --python tools/blender/bridge_stone.py
#
# Set TWISTY_PREVIEW=<directory> for a render.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common
from village_kit import Frame, Shape, finish, hexc, scale

SEED = 6113
BUDGET = 9000

LENGTH = 60.0
INNER = 10.9      # parapet inner face, across from the road's centre
FACE = 11.6       # outer face of the spandrel walls and the parapets
BED = -8.6        # river bed under the deck
FOOT = BED - 0.6  # the walls go into the bed
SPAN = 30.0       # arch opening along the road
SPRING = BED + 1.2
RISE = 6.2
DECK = 0.05       # the string course's foot, at the road
PARAPET = 1.0

STONE = hexc(0x9C9384)
STONE_WARM = hexc(0xA8987E)
RING = hexc(0x857C6E)
COPING = hexc(0xB0A898)
DAMP = hexc(0x5E6458)

RADIUS = (SPAN * SPAN / 4 + RISE * RISE) / (2 * RISE)
CENTRE = SPRING + RISE - RADIUS
SWEEP = math.asin(SPAN / 2 / RADIUS)


def intrados(z):
    """Height of the arch's underside at z (along the road), or None outside the opening."""
    if abs(z) >= SPAN / 2:
        return None
    return CENTRE + math.sqrt(RADIUS * RADIUS - z * z)


def stone_colour(sh, centre):
    # Damp darkens the stone toward the water, and lichen warms the top courses
    t = min(1.0, max(0.0, (centre.y - FOOT) / (DECK - FOOT)))
    base = STONE_WARM if sh.noise(centre, 3.0) > 0.55 else STONE
    tint = sh.jitter(base, 0.12, 0.04)
    damp = max(0.0, 0.45 - t) / 0.45
    return tuple(tint[c] * (1 - 0.45 * damp) + DAMP[c] * 0.45 * damp for c in range(3))


def bridge():
    sh = Shape("bridge_span", SEED)
    half = LENGTH / 2
    # The wall is cut where the arch is; elsewhere it stands on the bed
    low = lambda z: intrados(z) if intrados(z) is not None else FOOT
    for sign in (-1, 1):
        # The spandrel wall's outer face, in courses, the arch cut out of it
        f = Frame((sign * FACE, 0, -half), (0, 0, 1), (sign, 0, 0))
        breaks = [half - SPAN / 2, half + SPAN / 2] + [half + RADIUS * math.sin(-SWEEP + 2 * SWEEP * k / 16) for k in range(1, 16)]
        columns = []
        cuts = sorted({0.0, LENGTH, *[b for b in breaks if 0 < b < LENGTH]})
        for a, b in zip(cuts, cuts[1:]):
            count = max(1, math.ceil((b - a) / 1.15 - 1e-6))
            columns += [(a + (b - a) * n / count, a + (b - a) * (n + 1) / count) for n in range(count)]
        course = 0.62
        for a, b in columns:
            bottom = max(low(a - half), low(b - half))
            rows = max(1, round((DECK - bottom) / course))
            for row in range(rows):
                y0 = bottom + (DECK - bottom) * row / rows
                y1 = bottom + (DECK - bottom) * (row + 1) / rows
                # Stones of uneven length: every other course is offset half a stone
                y0a = low(a - half) if row == 0 else y0
                y0b = low(b - half) if row == 0 else y0
                centre = f.p((a + b) / 2, (y0 + y1) / 2)
                tint = stone_colour(sh, centre)
                sh.face([f.p(a, y0a), f.p(b, y0b), f.p(b, y1), f.p(a, y1)],
                        [scale(tint, 0.86), scale(tint, 0.86), scale(tint, 1.05), scale(tint, 1.05)], f.out)
        # The voussoirs: a ring of wedge stones round the arch, proud of the face
        ring = 22
        for k in range(ring):
            a0 = -SWEEP + 2 * SWEEP * k / ring
            a1 = -SWEEP + 2 * SWEEP * (k + 1) / ring
            depth = 1.05 + (0.18 if k % 2 else 0.0)
            pts = []
            for a in (a0, a1):
                z = RADIUS * math.sin(a)
                y = CENTRE + RADIUS * math.cos(a)
                pts.append((z, y, z * (RADIUS + depth) / RADIUS, CENTRE + (y - CENTRE) * (RADIUS + depth) / RADIUS))
            x = sign * (FACE + 0.12)
            quad = [(x, pts[0][1], pts[0][0]), (x, pts[1][1], pts[1][0]), (x, pts[1][3], pts[1][2]), (x, pts[0][3], pts[0][2])]
            tint = sh.jitter(RING, 0.1, 0.03)
            sh.face(quad, tint, (sign, 0, 0))
            # The ring's soffit edge and its outer edge, so it reads as stone set proud
            sh.face([(sign * FACE, pts[0][1], pts[0][0]), (x, pts[0][1], pts[0][0]), (x, pts[1][1], pts[1][0]), (sign * FACE, pts[1][1], pts[1][0])], scale(tint, 0.8), (0, -1, 0))
            sh.face([(sign * FACE, pts[0][3], pts[0][2]), (x, pts[0][3], pts[0][2]), (x, pts[1][3], pts[1][2]), (sign * FACE, pts[1][3], pts[1][2])], scale(tint, 0.95), (0, 1, 0))
        # The string course at the deck, a band proud of the wall
        s = 0.0
        while s < LENGTH - 1e-6:
            e = min(LENGTH, s + sh.rng.uniform(0.9, 1.5))
            if LENGTH - e < 0.6:
                e = LENGTH
            sh.fbox(f, (s, e), (DECK - 0.05, DECK + 0.28), (0, 0.16), sh.jitter(COPING, 0.08), skip=("back", "left", "right"))
            s = e
        # The parapet: courses on both faces, coping stones on top
        out = Frame((sign * FACE, 0, -half), (0, 0, 1), (sign, 0, 0))
        inside = Frame((sign * INNER, 0, -half), (0, 0, 1), (-sign, 0, 0))
        sh.courses(out, 0.6, LENGTH - 0.6, DECK + 0.28, PARAPET, STONE, course=0.36, stone=(0.5, 1.1), vary=0.12)
        sh.courses(inside, 0.6, LENGTH - 0.6, 0.0, PARAPET, STONE, course=0.36, stone=(0.5, 1.1), vary=0.12)
        s = 0.6
        while s < LENGTH - 0.6 - 1e-6:
            e = min(LENGTH - 0.6, s + sh.rng.uniform(0.7, 1.2))
            if LENGTH - 0.6 - e < 0.4:
                e = LENGTH - 0.6
            lo, hi = sorted((sign * (INNER - 0.08), sign * (FACE + 0.08)))
            sh.box((lo, PARAPET, s - half + 0.01), (hi, PARAPET + 0.18 + sh.rng.uniform(0, 0.03), e - half - 0.01), sh.jitter(COPING, 0.1, 0.03), skip=("-y",))
            s = e
        # The parapet's ends: a pier stone taller than the run
        for end in (0.0, LENGTH - 0.6):
            lo, hi = sorted((sign * (INNER - 0.15), sign * (FACE + 0.15)))
            sh.box((lo, 0.0, end - half), (hi, PARAPET + 0.45, end - half + 0.6), sh.jitter(STONE_WARM, 0.08), skip=("-y",))
    # The arch barrel: the underside of the deck between the walls, in rings of stone
    rows = 18
    across = 8
    for k in range(rows):
        a0 = -SWEEP + 2 * SWEEP * k / rows
        a1 = -SWEEP + 2 * SWEEP * (k + 1) / rows
        z0, z1 = RADIUS * math.sin(a0), RADIUS * math.sin(a1)
        y0, y1 = CENTRE + RADIUS * math.cos(a0), CENTRE + RADIUS * math.cos(a1)
        for n in range(across):
            x0 = -FACE + 2 * FACE * n / across
            x1 = -FACE + 2 * FACE * (n + 1) / across
            tint = sh.jitter(RING, 0.12, 0.03)
            # Seen from the water below
            sh.face([(x0, y0, z0), (x1, y0, z0), (x1, y1, z1), (x0, y1, z1)], [scale(tint, 0.8)] * 2 + [scale(tint, 0.9)] * 2, (0, -1, 0))
    return sh


def main():
    common.reset(SEED)
    finish(os.path.join(common.ASSETS, "bridge", "stone.glb"), [bridge()], SEED, BUDGET, reach=2.5, floor=False)


main()
