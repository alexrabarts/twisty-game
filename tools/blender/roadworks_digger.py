# The roadworks' mini digger (js/world/roadworks.js, `digger`): a compact excavator of about 2.5 t parked on the closed
# lane with its bucket curled onto its dozer blade, into assets/roadworks/digger.glb at three levels.
#
#   lod0   drawn within Roadworks.DIGGER_LOD_M[0] of the bike: rubber tracks with their lugs round the drive sprocket,
#          the idler and the rollers, the track frames, the slewing ring, the house with its rounded counterweight and
#          the engine hood's louvred grille, the cab (posts, roof, smoked glass, the seat and the controls inside), the
#          steps and grab rails, the lamps and the beacon, the bent boom, the stick, the bucket with its teeth and
#          linkage, three rams with their hoses, and the dozer blade with its ram; baked maps (maps.py)
#   lod1   the same outline with the small parts and the bevels left out, each finish one value of the atlas
#   lod2   the masses only
#
# Each level is one node `digger` under its group (`lod0`, `lod1`, `lod2`), a primitive for each finish. The game
# draws a level as one instanced mesh for each finish and keeps the procedural digger's box for the physics, so every
# level stays inside that box (BOX, tests/unit/roadworks-digger.test.js). No maker's name, logo or wordmark anywhere.
#
# Shapes are written in the game's axes (x across, y up, z forward to the blade, metres, the ground at y = 0) and
# turned into Blender's on the way in. A part laid on another part is cut into it or stands off it by more than the
# depth buffer parts at the distance it is drawn (tests/unit/model-coplanar.test.js): a grille that lay in its body's
# face fought it from the chase camera (the owner, 2026-11-27).
#
#   blender --background --factory-startup --python tools/blender/roadworks_digger.py
#
# TWISTY_DIGGER_OUT=<file.glb> writes a candidate build elsewhere (a round's variant); TWISTY_MAPS=0 builds without
# maps; TWISTY_MAPS_DIR=<dir> keeps the encoded maps to look at; TWISTY_SURFACE switches the layers (surface.py).
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common
import maps
import surface
from bike_kit import pack_colours, render

SEED = 3301
OUT = os.environ.get("TWISTY_DIGGER_OUT") or os.path.join(common.ASSETS, "roadworks", "digger.glb")
# The procedural digger's box (Roadworks.geometries `digger`), which the physics and the layout read: every level
# stays inside it
BOX = {"x": (-0.75, 0.75), "y": (0.01, 2.42), "z": (-1.15, 1.21)}
BUDGET = {"lod0": 9000, "lod1": 2600, "lod2": 700}
MAX_BYTES = 400_000
MAP_PX = 512
SHARP = math.radians(32)
BLOCK_SHADE = 0.9

# Finishes: (sRGB colour, roughness, metalness). The paint is a deep construction yellow; the frame, the undercarriage
# and the cab posts a dark grey; the rams polished
FINISHES = {
    "paint_body": (0xEEB21C, 0.42, 0.0),
    "frame": (0x2A2B2D, 0.6, 0.15),
    "rubber": (0x2F2C28, 0.95, 0.0),
    "steel": (0x6D6F71, 0.5, 0.85),
    "chrome": (0xC9CDD1, 0.18, 1.0),
    "seat": (0x34363A, 0.85, 0.0),
    "glass": (0x2C3338, 0.05, 0.0),
    "headlight": (0xE6E8EA, 0.15, 0.0),
    "signal": (0xE8770F, 0.3, 0.0),
}
# Each finish is a draw call and a mesh in the window's count for each level drawn (the stage's mesh cap had 118 to
# spare with three levels of nine finishes in view, LEG_BUDGET.meshes 800, the rule 120): the small finishes are
# drawn in a larger one's material, more of them the further the level is seen
MERGE = (
    {"headlight": "chrome", "signal": "paint_body", "seat": "frame"},
    {"headlight": "steel", "signal": "paint_body", "seat": "frame", "chrome": "steel"},
    {"headlight": "frame", "signal": "paint_body", "seat": "frame", "chrome": "frame", "steel": "frame"},
)


def linear(hex_colour):
    return surface._linear(hex_colour)


def B(p):
    """A game point (x, y, z) in Blender's axes (x, -z, y): the glTF export's +y up turns it back."""
    return Vector((p[0], -p[2], p[1]))


class Part:
    """A bmesh in game axes and its finish; parts of one finish join into one primitive."""

    def __init__(self, finish):
        self.finish = finish
        self.bm = bmesh.new()

    def vert(self, p):
        return self.bm.verts.new(B(p))

    def face(self, points):
        return self.bm.faces.new([self.vert(p) for p in points])


class Level:
    def __init__(self, name, detail):
        self.name = name
        # 0 the most detail, 2 the least
        self.detail = detail
        self.parts = []

    def part(self, finish):
        p = Part(finish)
        self.parts.append(p)
        return p

    # Primitives ---------------------------------------------------------------------------------------------------

    def box(self, finish, x0, x1, y0, y1, z0, z1, bevel=0.0, faces="all"):
        """An axis box; `bevel` rounds its edges (left out below detail 0). `faces` 'all', or a string of the sides to
        leave out ('bottom', 'back')."""
        p = self.part(finish)
        bm = p.bm
        corners = [[x, y, z] for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
        v = [bm.verts.new(B(c)) for c in corners]
        # (index x*4 + y*2 + z)
        quads = {
            "left": (0, 1, 3, 2), "right": (4, 6, 7, 5), "bottom": (0, 2, 6, 4), "top": (1, 5, 7, 3),
            "back": (0, 4, 5, 1), "front": (2, 3, 7, 6),
        }
        for side, q in quads.items():
            if faces != "all" and side in faces:
                continue
            bm.faces.new([v[i] for i in q])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if bevel and self.detail == 0:
            edges = [e for e in bm.edges if len(e.link_faces) == 2]
            bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True, profile=0.5)
        return p

    def prism(self, finish, profile, x0, x1, bevel=0.0, caps=True):
        """A profile of (z, y) points, convex or not, extruded across x from x0 to x1."""
        p = self.part(finish)
        bm = p.bm
        a = [bm.verts.new(B((x0, y, z))) for z, y in profile]
        b = [bm.verts.new(B((x1, y, z))) for z, y in profile]
        n = len(profile)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([a[i], a[j], b[j], b[i]])
        if caps:
            bm.faces.new(a)
            bm.faces.new(list(reversed(b)))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if bevel and self.detail == 0:
            edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.5]
            bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True, profile=0.5)
        return p

    def plan(self, finish, outline, y0, y1, bevel=0.0, bottom=True):
        """A plan outline of (x, z) points raised from y0 to y1."""
        p = self.part(finish)
        bm = p.bm
        a = [bm.verts.new(B((x, y0, z))) for x, z in outline]
        b = [bm.verts.new(B((x, y1, z))) for x, z in outline]
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([a[i], a[j], b[j], b[i]])
        bm.faces.new(list(b))
        if bottom:
            bm.faces.new(list(reversed(a)))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if bevel and self.detail == 0:
            edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.6]
            bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=2, affect="EDGES", clamp_overlap=True, profile=0.5)
        return p

    def cylinder(self, finish, a, b, r, sides, caps=True, r1=None):
        """A cylinder (or a cone frustum to radius r1) from point a to point b."""
        p = self.part(finish)
        bm = p.bm
        a, b = Vector(a), Vector(b)
        axis = (b - a).normalized()
        t = Vector((1, 0, 0)) if abs(axis.x) < 0.9 else Vector((0, 1, 0))
        u = axis.cross(t).normalized()
        w = axis.cross(u)
        r1 = r if r1 is None else r1
        ring = lambda c, rr: [bm.verts.new(B(c + (u * math.cos(k * 2 * math.pi / sides) + w * math.sin(k * 2 * math.pi / sides)) * rr)) for k in range(sides)]
        ra, rb = ring(a, r), ring(b, r1)
        for k in range(sides):
            j = (k + 1) % sides
            bm.faces.new([ra[k], ra[j], rb[j], rb[k]])
        if caps:
            bm.faces.new(list(reversed(ra)))
            bm.faces.new(rb)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return p

    def tube(self, finish, points, r, sides):
        """A hose: a circle swept along a polyline of game points, open ends."""
        p = self.part(finish)
        bm = p.bm
        pts = [Vector(q) for q in points]
        rings = []
        prev = None
        for i, c in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            if prev is None:
                t = Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0))
                prev = d.cross(t).normalized()
            u = (prev - d * prev.dot(d)).normalized()
            prev = u
            w = d.cross(u)
            rings.append([bm.verts.new(B(c + (u * math.cos(k * 2 * math.pi / sides) + w * math.sin(k * 2 * math.pi / sides)) * r)) for k in range(sides)])
        for ra, rb in zip(rings, rings[1:]):
            for k in range(sides):
                j = (k + 1) % sides
                bm.faces.new([ra[k], ra[j], rb[j], rb[k]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return p


def arc(cz, cy, r, a0, a1, n):
    """Points (z, y) on a circle about (cz, cy) from angle a0 to a1 (radians, 0 toward +z, pi/2 up)."""
    return [(cz + r * math.cos(a0 + (a1 - a0) * k / n), cy + r * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]


def hull(points):
    """The convex hull of (z, y) points, counter-clockwise."""
    pts = sorted(set((round(p[0], 6), round(p[1], 6)) for p in points))
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


# The undercarriage --------------------------------------------------------------------------------------------------

SPROCKET = (-0.9, 0.235, 0.15)   # z, y, r (the drive, at the back)
IDLER = (0.86, 0.225, 0.14)
TRACK_T = 0.05
TRACK_X = (0.4, 0.75)             # the outside track's inner and outer x (the other is mirrored)


def track_path(level):
    """The track's inner line in (z, y), counter-clockwise from the front seen from +x."""
    n = (14, 8, 5)[level.detail]
    pts = [(z, y) for z, y in arc(SPROCKET[0], SPROCKET[1], SPROCKET[2], 0, 2 * math.pi, 2 * n)]
    pts += [(z, y) for z, y in arc(IDLER[0], IDLER[1], IDLER[2], 0, 2 * math.pi, 2 * n)]
    pts += [(-0.72, 0.085), (0.7, 0.085)]
    return hull(pts)


def offset(path, d):
    """A closed convex path pushed out by d along each corner's mean normal."""
    out = []
    n = len(path)
    for i in range(n):
        a, b, c = path[i - 1], path[i], path[(i + 1) % n]
        e1 = Vector((b[0] - a[0], b[1] - a[1])).normalized()
        e2 = Vector((c[0] - b[0], c[1] - b[1])).normalized()
        # outward of a counter-clockwise path is to the right of travel
        n1 = Vector((e1.y, -e1.x))
        n2 = Vector((e2.y, -e2.x))
        m = (n1 + n2).normalized()
        k = d / max(0.3, m.dot(n1))
        out.append((b[0] + m.x * k, b[1] + m.y * k))
    return out


def track(level, side):
    x0, x1 = (TRACK_X if side > 0 else (-TRACK_X[1], -TRACK_X[0]))
    inner = track_path(level)
    outer = offset(inner, TRACK_T)
    p = level.part("rubber")
    bm = p.bm
    n = len(inner)
    ring = lambda path, x: [bm.verts.new(B((x, y, z))) for z, y in path]
    ia, ib, oa, ob = ring(inner, x0), ring(inner, x1), ring(outer, x0), ring(outer, x1)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([oa[i], oa[j], ob[j], ob[i]])
        bm.faces.new([ia[j], ia[i], ib[i], ib[j]])
        bm.faces.new([ia[i], ia[j], oa[j], oa[i]])
        bm.faces.new([ib[j], ib[i], ob[i], ob[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if level.detail > 0:
        return
    # The lugs: staggered bars across the outside of the belt every LUG_M, standing 2 cm proud (each a box on the belt)
    length = sum(math.dist(outer[i], outer[(i + 1) % n]) for i in range(n))
    step, k = 0.105, 0
    s = 0.0
    while s < length - step / 2:
        # the place on the outer path at distance s
        t, i = s, 0
        while True:
            seg = math.dist(outer[i], outer[(i + 1) % n])
            if t <= seg:
                break
            t -= seg
            i += 1
        a, b = Vector(outer[i]), Vector(outer[(i + 1) % n])
        tangent = (b - a).normalized()
        normal = Vector((tangent.y, -tangent.x))
        c = a + tangent * t
        half = 0.022
        w = x1 - x0
        xs = (x0 + 0.01, x0 + w * 0.62) if k % 2 == 0 else (x0 + w * 0.38, x1 - 0.01)
        pts = []
        for along, up in ((-half, 0), (half, 0), (half, 0.022), (-half, 0.018)):
            q = c + tangent * along + normal * (up - 0.004)
            pts.append((q.x, q.y))
        level.prism("rubber", pts, xs[0], xs[1])
        k += 1
        s += step


def undercarriage(level):
    d = level.detail
    for side in (1, -1):
        track(level, side)
        cx = side * 0.575
        # The track frame between the wheels: a box section under the belt's top run, with the inner side plate
        if d < 2:
            level.box("frame", cx - 0.1, cx + 0.1, 0.13, 0.33, -0.78, 0.8, bevel=0.012)
        else:
            level.box("frame", cx - 0.12, cx + 0.12, 0.08, 0.36, -0.95, 0.95)
            continue
        # The drive sprocket (teeth round a hub, the motor inboard) and the idler, each inside the belt
        sz, sy, sr = SPROCKET
        iz, iy, ir = IDLER
        x_in, x_out = (TRACK_X[0] + 0.03, TRACK_X[1] - 0.03)
        xa, xb = (x_in, x_out) if side > 0 else (-x_out, -x_in)
        sides = (18, 10, 6)[d]
        level.cylinder("steel", (xa, sy, sz), (xb, sy, sz), sr - 0.012, sides)
        level.cylinder("frame", (xa, iy, iz), (xb, iy, iz), ir - 0.012, sides)
        if d == 0:
            # Sprocket teeth, the motor's drum on the inside and the hub bolts' ring
            for k in range(12):
                a = k * 2 * math.pi / 12
                tz, ty = sz + math.cos(a) * (sr - 0.035), sy + math.sin(a) * (sr - 0.035)
                level.box("steel", xa + 0.03, xb - 0.03, ty - 0.018, ty + 0.018, tz - 0.018, tz + 0.018)
            motor_x = (TRACK_X[0] - 0.09, TRACK_X[0] + 0.02) if side > 0 else (-TRACK_X[0] - 0.02, -TRACK_X[0] + 0.09)
            level.cylinder("frame", (motor_x[0], sy, sz), (motor_x[1], sy, sz), 0.12, 14)
            hub_x = xb + 0.012 if side > 0 else xa - 0.012
            level.cylinder("steel", ((xb if side > 0 else xa), sy, sz), (hub_x, sy, sz), 0.07, 12)
            level.cylinder("steel", ((xb if side > 0 else xa), iy, iz), (hub_x, iy, iz), 0.06, 12)
            # The bottom rollers and the top carrier roller
            for z in (-0.5, -0.17, 0.17, 0.5):
                level.cylinder("steel", (xa + 0.04, 0.145, z), (xb - 0.04, 0.145, z), 0.055, 10)
            level.cylinder("steel", (xa + 0.06, 0.35, 0.0), (xb - 0.06, 0.35, 0.0), 0.03, 8)
            # A step plate on the outside of the frame, by the cab (the left, -x)
            if side < 0:
                level.box("frame", -0.79 + 0.04, -0.68 + 0.04, 0.34, 0.36, -0.2, 0.15)
    # The centre frame between the tracks, and the slewing ring under the house
    level.box("frame", -0.47, 0.47, 0.16, 0.36, -0.55, 0.6, bevel=0.015)
    level.cylinder("frame", (0, 0.34, 0), (0, 0.46, 0), 0.38, (28, 14, 8)[d])
    if d == 0:
        level.cylinder("steel", (0, 0.41, 0), (0, 0.43, 0), 0.392, 28, caps=False)


def blade(level):
    d = level.detail
    # The dozer blade across the front: a curved mouldboard, its cutting edge, two arms back to the centre frame and
    # its ram in the middle
    n = (8, 4, 2)[d]
    # (clear of the belts' front ends, which reach z = 1.07)
    face = [(1.175 - 0.035 * math.sin(math.pi * k / n), 0.06 + 0.35 * k / n) for k in range(n + 1)]
    back = [(z - 0.05, y) for z, y in reversed(face)]
    level.prism("paint_body", face + back, -0.75, 0.75, bevel=0.01)
    if d < 2:
        level.prism("steel", [(1.17, 0.012), (1.205, 0.012), (1.205, 0.07), (1.17, 0.07)], -0.745, 0.745)
    for x in (-0.3, 0.3):
        level.prism("paint_body", [(0.55, 0.2), (1.1, 0.1), (1.1, 0.34), (0.55, 0.32)], x - 0.05, x + 0.05, bevel=0.01)
    if d == 0:
        level.cylinder("frame", (0.0, 0.28, 0.6), (0.0, 0.33, 0.95), 0.05, 12)
        level.cylinder("chrome", (0.0, 0.33, 0.95), (0.0, 0.35, 1.1), 0.028, 10)
        # Ribs on the blade's back, between the belts
        for x in (-0.15, 0.15):
            level.prism("paint_body", [(1.02, 0.08), (1.1, 0.08), (1.1, 0.39), (1.02, 0.36)], x - 0.012, x + 0.012)


# The house --------------------------------------------------------------------------------------------------------

DECK_Y = (0.46, 0.54)
TAIL_R = 0.74


def house_outline(level, r=TAIL_R, front=0.7, half=0.7):
    """The house's plan as (x, z): a round tail of radius r about the slewing centre between straight sides, and a
    straight front, from the front right round the tail to the front left."""
    n = (16, 8, 5)[level.detail]
    a = math.asin(min(1.0, half / r))
    tail = [(r * math.sin(a - 2 * a * k / n), -r * math.cos(a - 2 * a * k / n)) for k in range(n + 1)]
    return [(half, front)] + tail + [(-half, front)]


def house(level):
    d = level.detail
    level.plan("frame", house_outline(level, front=0.72), DECK_Y[0], DECK_Y[1], bevel=0.01)
    # The counterweight: the round tail, cast, its top rounded; the engine hood over the right of the deck behind
    # the boom; the cab on the left
    outline = house_outline(level, r=TAIL_R - 0.005, front=-0.18, half=0.695)
    level.plan("paint_body", outline, DECK_Y[1], 0.98, bevel=0.03, bottom=False)
    # The hood on the right: from the counterweight's top to 1.18 m, from the cab's side to the right edge
    hood = [(0.69, -0.2), (0.69, 0.55), (0.1, 0.55), (0.1, -0.2)]
    level.plan("paint_body", hood, DECK_Y[1], 1.16, bevel=0.03, bottom=False)
    if d == 0:
        # A rounded cap over the counterweight's edge and the hood's top
        level.plan("paint_body", house_outline(level, r=TAIL_R - 0.03, front=-0.2, half=0.67), 0.98, 1.0, bevel=0.008, bottom=False)
    # The grille in the counterweight's round back: a dark panel following the curve 1.5 cm proud of the skin, its
    # louvres a further 1.5 cm out and a frame round it in the paint (each stands off the face behind it by more than
    # the depth buffer parts at the chase cameras' distances: tests/unit/model-coplanar.test.js)
    if d < 2:
        skin = TAIL_R - 0.005
        a0, a1, gy0, gy1 = 0.12, 0.74, 0.62, 0.9
        n = (10, 5, 3)[d]

        def band(finish, r0, r1, b0, b1, y0, y1):
            outer = [(r1 * math.sin(b0 + (b1 - b0) * k / n), -r1 * math.cos(b0 + (b1 - b0) * k / n)) for k in range(n + 1)]
            inner = [(r0 * math.sin(b1 - (b1 - b0) * k / n), -r0 * math.cos(b1 - (b1 - b0) * k / n)) for k in range(n + 1)]
            level.plan(finish, outer + inner, y0, y1)

        band("frame", skin - 0.02, skin + 0.015, a0, a1, gy0, gy1)
        if d == 0:
            for k in range(6):
                y = gy0 + 0.035 + k * (gy1 - gy0 - 0.07) / 5
                band("frame", skin, skin + 0.03, a0 + 0.03, a1 - 0.03, y - 0.011, y + 0.011)
            band("paint_body", skin - 0.02, skin + 0.035, a0 - 0.03, a1 + 0.03, gy1, gy1 + 0.025)
            band("paint_body", skin - 0.02, skin + 0.035, a0 - 0.03, a1 + 0.03, gy0 - 0.025, gy0)
            band("paint_body", skin - 0.02, skin + 0.035, a0 - 0.03, a0, gy0, gy1)
            band("paint_body", skin - 0.02, skin + 0.035, a1, a1 + 0.03, gy0, gy1)
        if d == 0:
            # A grab handle on the hood's side and the fuel cap
            level.tube("frame", [(0.69, 1.05, -0.05), (0.725, 1.05, -0.05), (0.725, 1.05, 0.35), (0.69, 1.05, 0.35)], 0.012, 6)
            level.cylinder("frame", (0.4, 1.16, 0.3), (0.4, 1.19, 0.3), 0.045, 10)
            # The exhaust stub up through the hood
            level.cylinder("frame", (0.55, 1.1, -0.05), (0.55, 1.3, -0.05), 0.03, 8)
            level.cylinder("frame", (0.55, 1.3, -0.05), (0.55, 1.33, 0.0), 0.03, 8)
            # Rear lamps either side of the grille
            for x in (-0.5, 0.62):
                zz = -math.sqrt(max(0.0, (TAIL_R - 0.005) ** 2 - x * x))
                level.box("frame", x - 0.06, x + 0.06, 0.88, 0.94, zz - 0.03, zz + 0.02)
                level.box("headlight", x - 0.045, x + 0.045, 0.893, 0.927, zz - 0.04, zz - 0.02)
    # The swing bracket at the front of the deck, the boom's foot pin through it
    level.box("paint_body", 0.14, 0.46, 0.5, 0.9, 0.62, 0.9, bevel=0.02)
    if d == 0:
        level.cylinder("steel", (0.12, 0.8, 0.82), (0.48, 0.8, 0.82), 0.035, 10)


# The cab ----------------------------------------------------------------------------------------------------------

CAB = {"x": (-0.7, 0.08), "z": (-0.5, 0.58), "y": (DECK_Y[1], 2.26)}
POST = 0.05


def cab(level):
    d = level.detail
    x0, x1 = CAB["x"]
    z0, z1 = CAB["z"]
    y0, y1 = CAB["y"]
    # The cab's sill (a low wall round its floor) in the paint
    level.box("paint_body", x0, x1, y0, 0.78, z0, z1, bevel=0.02, faces="bottom")
    # The posts: four corners and a front pair leaning back a little; the roof over them
    p = POST
    posts = [(x0, z0), (x1, z0), (x0, z1), (x1, z1)]
    for px, pz in posts:
        sx = px + (p if px == x0 else -p)
        sz = pz + (p if pz == z0 else -p)
        level.box("frame", min(px, sx), max(px, sx), 0.78, y1 - 0.06, min(pz, sz), max(pz, sz), bevel=0.01)
    if d == 0:
        # The door's rear post, the rails across at the waist and under the roof
        level.box("frame", x0, x0 + p, 0.78, y1 - 0.06, -0.05, -0.05 + p, bevel=0.008)
        for y in (1.18,):
            level.box("frame", x0, x0 + 0.03, y - 0.02, y + 0.02, z0 + p, z1 - p)
            level.box("frame", x1 - 0.03, x1, y - 0.02, y + 0.02, z0 + p, z1 - p)
    # The roof: a shallow dome in the paint, overhanging the posts
    r = [(z0 - 0.04, y1 - 0.06), (z1 + 0.06, y1 - 0.06), (z1 + 0.04, y1 + 0.02), (z1 - 0.15, y1 + 0.07), (z0 + 0.1, y1 + 0.07), (z0 - 0.02, y1 + 0.03)]
    level.prism("paint_body", r, x0 - 0.03, x1 + 0.03, bevel=0.015)
    # The glass: each pane set in from the posts' outer faces by INSET (so no pane lies in a post's face), facing out
    inset = 0.022
    ga, gb = 0.8, y1 - 0.08
    panes = [
        ("front", [(x0 + p, ga, z1 - inset), (x1 - p, ga, z1 - inset), (x1 - p, gb, z1 - inset), (x0 + p, gb, z1 - inset)]),
        ("back", [(x1 - p, ga + 0.25, z0 + inset), (x0 + p, ga + 0.25, z0 + inset), (x0 + p, gb, z0 + inset), (x1 - p, gb, z0 + inset)]),
        ("left", [(x0 + inset, ga, z0 + p), (x0 + inset, ga, z1 - p), (x0 + inset, gb, z1 - p), (x0 + inset, gb, z0 + p)]),
        ("right", [(x1 - inset, ga, z1 - p), (x1 - inset, ga, z0 + p), (x1 - inset, gb, z0 + p), (x1 - inset, gb, z1 - p)]),
    ]
    g = level.part("glass")
    for name, quad in panes:
        g.face(quad)
    # (each pane faces out of the cab: the game draws the glass one sided, so at most one pane is in front of any
    # pixel and the transparent panes need no order among themselves)
    centre = Vector(B(((x0 + x1) / 2, (ga + gb) / 2, (z0 + z1) / 2)))
    for f in g.bm.faces:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - centre) < 0:
            f.normal_flip()
    if d == 2:
        return
    # Inside, seen faintly through the glass: the floor, the seat and its back, the two control consoles with their
    # joysticks, the travel levers and the dash
    level.box("seat", x0 + 0.06, x1 - 0.06, 0.78, 0.8, z0 + 0.06, z1 - 0.06)
    cx = (x0 + x1) / 2
    level.box("seat", cx - 0.23, cx + 0.23, 0.95, 1.06, -0.32, 0.08, bevel=0.03)
    level.box("seat", cx - 0.23, cx + 0.23, 1.06, 1.62, -0.4, -0.29, bevel=0.03)
    level.box("frame", cx - 0.12, cx + 0.12, 0.8, 0.95, -0.26, 0.0)
    if d == 0:
        for sx in (-1, 1):
            bx = cx + sx * 0.3
            level.box("frame", bx - 0.06, bx + 0.06, 0.8, 1.1, -0.3, 0.1, bevel=0.01)
            level.cylinder("seat", (bx, 1.1, 0.05), (bx, 1.26, 0.07), 0.016, 6)
            level.cylinder("seat", (bx, 1.26, 0.07), (bx, 1.3, 0.08), 0.028, 8)
        for sx in (-0.07, 0.07):
            level.cylinder("frame", (cx + sx, 0.8, 0.4), (cx + sx, 1.25, 0.33), 0.012, 6)
        level.box("frame", cx - 0.22, cx + 0.22, 0.8, 1.0, 0.44, 0.52)
        # Work lamps on the roof's front corners, a beacon on the roof, a mirror on the right front post
        for lx in (x0 + 0.1, x1 - 0.1):
            level.box("frame", lx - 0.06, lx + 0.06, y1 + 0.02, y1 + 0.1, z1 - 0.06, z1 + 0.01, bevel=0.01)
            level.box("headlight", lx - 0.045, lx + 0.045, y1 + 0.035, y1 + 0.085, z1 + 0.01, z1 + 0.02)
        level.cylinder("frame", (x0 + 0.2, y1 + 0.06, z0 + 0.25), (x0 + 0.2, y1 + 0.085, z0 + 0.25), 0.065, 12)
        level.cylinder("signal", (x0 + 0.2, y1 + 0.085, z0 + 0.25), (x0 + 0.2, y1 + 0.155, z0 + 0.25), 0.055, 12, r1=0.045)
        level.tube("frame", [(x1 + 0.0, 1.6, z1), (x1 + 0.12, 1.66, z1 + 0.05), (x1 + 0.16, 1.7, z1 + 0.06)], 0.01, 6)
        level.box("frame", x1 + 0.13, x1 + 0.2, 1.66, 1.82, z1 + 0.04, z1 + 0.06)
        # The grab rail beside the door (left), and the door's handle
        level.tube("steel", [(x0 - 0.005, 0.9, -0.03), (x0 - 0.035, 0.92, -0.03), (x0 - 0.035, 1.75, -0.03), (x0 - 0.005, 1.77, -0.03)], 0.012, 6)
        level.box("frame", x0 - 0.02, x0, 1.2, 1.24, 0.35, 0.45)


# The arm ----------------------------------------------------------------------------------------------------------

BOOM_X = (0.2, 0.4)
FOOT = (0.82, 0.8)          # z, y of the boom's foot pin
ELBOW = (1.0, 1.56)
TIP = (1.1, 1.93)
BUCKET_PIN = (1.06, 0.83)


def beam(level, finish, a, b, wa, wb, x0, x1, bevel=0.012):
    """A tapered box beam in the (z, y) plane from a to b, wa and wb deep at its ends."""
    dz, dy = b[0] - a[0], b[1] - a[1]
    l = math.hypot(dz, dy)
    nz, ny = -dy / l, dz / l
    pts = [(a[0] + nz * wa / 2, a[1] + ny * wa / 2), (b[0] + nz * wb / 2, b[1] + ny * wb / 2),
           (b[0] - nz * wb / 2, b[1] - ny * wb / 2), (a[0] - nz * wa / 2, a[1] - ny * wa / 2)]
    level.prism(finish, pts, x0, x1, bevel=bevel)


def ram(level, a, b, r, sides):
    """A hydraulic ram from a to b (game points): the barrel in the frame's grey from a, the rod polished to b."""
    a, b = Vector(a), Vector(b)
    m = a + (b - a) * 0.58
    level.cylinder("frame", a, m, r, sides)
    level.cylinder("chrome", m - (b - a).normalized() * 0.03, b, r * 0.5, max(6, sides - 4))
    if level.detail == 0:
        level.cylinder("frame", a - (b - a).normalized() * 0.03, a + (b - a).normalized() * 0.05, r * 1.25, sides)
        level.cylinder("frame", m - (b - a).normalized() * 0.04, m, r * 1.2, sides)


def arm(level):
    d = level.detail
    x0, x1 = BOOM_X
    xc = (x0 + x1) / 2
    # The boom, bent: a curve from the foot through the bend to the tip, deepest at the bend
    n = (10, 4, 2)[d]
    curve = []
    for k in range(n + 1):
        t = k / n
        # a quadratic through the foot, the bend (as its control, pulled out so the curve passes near it) and the tip
        cz = 2 * ELBOW[0] - (FOOT[0] + TIP[0]) / 2
        cy = 2 * ELBOW[1] - (FOOT[1] + TIP[1]) / 2
        z = (1 - t) ** 2 * FOOT[0] + 2 * (1 - t) * t * cz + t * t * TIP[0]
        y = (1 - t) ** 2 * FOOT[1] + 2 * (1 - t) * t * cy + t * t * TIP[1]
        depth = 0.17 + 0.09 * math.sin(math.pi * min(1.0, t * 1.15)) - 0.04 * t
        curve.append((z, y, depth))
    top, bottom = [], []
    for k, (z, y, depth) in enumerate(curve):
        a_, b_ = curve[max(0, k - 1)], curve[min(n, k + 1)]
        tz, ty = b_[0] - a_[0], b_[1] - a_[1]
        l = math.hypot(tz, ty)
        nz, ny = -ty / l, tz / l
        top.append((z + nz * depth / 2, y + ny * depth / 2))
        bottom.append((z - nz * depth / 2, y - ny * depth / 2))
    level.prism("paint_body", top + list(reversed(bottom)), x0, x1, bevel=0.012)
    # The stick hanging from the boom's tip to the bucket's pin, its head standing above the tip
    head = (TIP[0] - 0.04, TIP[1] + 0.16)
    beam(level, "paint_body", head, BUCKET_PIN, 0.17, 0.1, x0 + 0.03, x1 - 0.03)
    # The bucket, curled onto the blade: a curved shell between two side plates, teeth down on the blade's top
    n = (8, 4, 2)[d]
    shell = arc(1.0, 0.615, 0.2, math.radians(-150), math.radians(85), n)
    inner = [(1.0 + (z - 1.0) * 0.85, 0.615 + (y - 0.615) * 0.85) for z, y in reversed(shell)]
    bx0, bx1 = xc - 0.22, xc + 0.22
    level.prism("frame", shell + inner, bx0 + 0.012, bx1 - 0.012)
    for x in (bx0, bx1 - 0.012):
        level.prism("frame", shell, x, x + 0.012)
    if d == 2:
        return
    # The rams: the boom's under the boom from the swing bracket, the stick's over the boom, the bucket's down the
    # stick's front
    sides = (12, 8, 6)[d]
    ram(level, (xc, 0.62, 0.86), (xc, 1.36, 1.1), 0.05, sides)
    ram(level, (xc, 1.62, 0.84), (xc, 2.13, 1.02), 0.042, sides)
    ram(level, (xc, 1.95, 1.163), (xc, 1.02, 1.163), 0.032, sides)
    if d > 0:
        return
    # The bucket's linkage, the pins, the teeth and the cutting edge
    level.prism("frame", [(1.16, 1.02), (1.2, 1.0), (1.1, 0.84), (1.06, 0.86)], xc - 0.095, xc - 0.075)
    level.prism("frame", [(1.16, 1.02), (1.2, 1.0), (1.1, 0.84), (1.06, 0.86)], xc + 0.075, xc + 0.095)
    for (z, y) in (FOOT, ELBOW, TIP, BUCKET_PIN, (1.17, 1.01)):
        level.cylinder("steel", (x0 - 0.015, y, z), (x1 + 0.015, y, z), 0.03, 10)
    tz, ty = shell[0]
    for k in range(4):
        x = bx0 + 0.06 + k * (bx1 - bx0 - 0.12) / 3
        level.prism("steel", [(tz + 0.03, ty + 0.03), (tz - 0.05, ty - 0.05), (tz - 0.08, ty + 0.0), (tz - 0.01, ty + 0.07)], x - 0.03, x + 0.03)
    # Hoses: a pair along the boom's top to the stick ram, a pair down its side to the bucket ram, each sagging a
    # little between its clamps
    for k, dx in enumerate((-0.025, 0.025)):
        x = xc + dx
        level.tube("rubber", [(x, 0.95, 0.72), (x, 1.32, 0.86 + 0.01 * k), (x, 1.66, 0.93), (x, 1.85, 0.98), (x, 2.0, 1.03)], 0.012, 6)
        xs = x1 + 0.015 + 0.025 * k
        level.tube("rubber", [(xs, 1.0, 0.8), (xs, 1.45, 0.94), (xs, 1.82, 1.05), (xs, 1.98, 1.14), (xs, 1.97, 1.2)], 0.012, 6)
    # A work lamp on the boom
    level.box("frame", xc - 0.05, xc + 0.05, 1.34, 1.42, 1.1, 1.16)
    level.box("headlight", xc - 0.038, xc + 0.038, 1.35, 1.41, 1.16, 1.17)


# Build ------------------------------------------------------------------------------------------------------------

def material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    colour, rough, metal = FINISHES[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*linear(colour), 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if name == "glass":
        # See-through and one sided in the file (the game draws it as Roadworks.smokedGlass)
        bsdf.inputs["Alpha"].default_value = 0.5
        m.surface_render_method = "BLENDED"
        m.use_backface_culling = True
    return m


def build(name, detail):
    level = Level(name, detail)
    undercarriage(level)
    blade(level)
    house(level)
    cab(level)
    arm(level)
    # One mesh: every part joined, a material slot per finish
    bm = bmesh.new()
    for p in level.parts:
        p.finish = MERGE[detail].get(p.finish, p.finish)
    finishes = sorted({p.finish for p in level.parts})
    index = {f: i for i, f in enumerate(finishes)}
    for part in level.parts:
        part.bm.normal_update()
        mesh = bpy.data.meshes.new("tmp")
        part.bm.to_mesh(mesh)
        for poly in mesh.polygons:
            poly.material_index = index[part.finish]
        bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
        part.bm.free()
    mesh = bpy.data.meshes.new(f"digger_{name}")
    bm.to_mesh(mesh)
    bm.free()
    for f in finishes:
        mesh.materials.append(material(f))
    # Curved parts (the wheels, the belts, the rams, the hoses, the bucket) shade smooth; an edge sharper than SHARP
    # stays a crease, so a bevel reads as its own band of light
    mesh.shade_smooth()
    mesh.set_sharp_from_angle(angle=SHARP)
    obj = bpy.data.objects.new(f"digger_{name}", mesh)
    bpy.context.scene.collection.objects.link(obj)
    group = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(group)
    obj.parent = group
    return obj, group


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def bounds(obj):
    xs, ys, zs = [], [], []
    for v in obj.data.vertices:
        x, by, bz = v.co
        xs.append(x)
        ys.append(bz)
        zs.append(-by)
    return {"x": (min(xs), max(xs)), "y": (min(ys), max(ys)), "z": (min(zs), max(zs))}


def main():
    common.reset(SEED)
    levels = {}
    for name, detail in (("lod0", 0), ("lod1", 1), ("lod2", 2)):
        obj, group = build(name, detail)
        # The occlusion between parts is in the maps' own pass; the triangles are counted as drawn
        bpy.context.view_layer.objects.active = obj
        levels[name] = (obj, group)
        tris = triangles(obj)
        box = bounds(obj)
        print(f"digger {name}: {tris} triangles, box {box}")
        for axis, (lo, hi) in BOX.items():
            k = "xyz".index(axis)
            for f in obj.data.polygons:
                for i in f.vertices:
                    co = obj.data.vertices[i].co
                    val = (co.x, co.z, -co.y)[k]
                    if val < lo - 1e-3 or val > hi + 1e-3:
                        print(f"  out of the box: {axis}={val:.3f} at {tuple(round(c, 3) for c in (co.x, co.z, -co.y))} ({obj.data.materials[f.material_index].name})")
                        break
        if tris > BUDGET[name]:
            raise SystemExit(f"digger {name}: {tris} triangles is over its budget of {BUDGET[name]}")
        for axis, (lo, hi) in BOX.items():
            if box[axis][0] < lo - 1e-3 or box[axis][1] > hi + 1e-3:
                raise SystemExit(f"digger {name}: {axis} {box[axis]} leaves the physics box {BOX[axis]}")
    objects = [levels[n][0] for n in ("lod0", "lod1", "lod2")]
    use_maps = os.environ.get("TWISTY_MAPS", "1") != "0"
    files = extras = None
    if use_maps:
        maps.SIZE = MAP_PX
        blocks = maps.unwrap(objects, low=objects[1:])
        cfg = surface.config(steps=("tone", "speckle", "cavity", "bump", "roughness", "wear", "dirt"),
                             dirt={"height": 0.75, "amount": 0.85, "colour": (0.58, 0.47, 0.34), "scale": 0.18},
                             wear={"amount": 0.4, "start": 0.1, "full": 0.4},
                             bump={"large": 0.4, "large_angle": 0.05, "fine": 0.05, "fine_angle": 0.025})
        colours = {name: finish for name, finish in FINISHES.items()}
        arrays, extras = maps.bake(objects[:1], cfg, colours, seed=SEED, headroom=1.15, size=MAP_PX, blocks=blocks)
        # lod1 and lod2 read one texel of their finish's block, where lod0's small islands lie with their worn edges:
        # that drew the far levels paler than lod0 (a lemon yellow at 60 m). Each block takes its finish's plain
        # values, at lod0's mean shade (BLOCK_SHADE: the cavity and the dirt), so the levels match
        for name, k in blocks.items():
            extra = extras.get(name, {"lift": 1.0, "roughness": 0.5, "metalness": 0.0})
            x0, x1 = k * maps.BLOCK_PX, (k + 1) * maps.BLOCK_PX
            v = min(1.0, BLOCK_SHADE / extra["lift"])
            v = v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
            arrays["colour"][:maps.BLOCK_PX, x0:x1] = (v, v, v, 1)
            arrays["orm"][:maps.BLOCK_PX, x0:x1] = (1, extra["roughness"], extra["metalness"], 1)
            arrays["normal"][:maps.BLOCK_PX, x0:x1] = (0.5, 0.5, 1, 1)
        keep = os.environ.get("TWISTY_MAPS_DIR")
        files = {}
        for key in ("colour", "normal", "orm"):
            path = os.path.join(keep or common.CACHE, f"digger-{key}.webp")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            files[key] = maps.webp(arrays[key], path, maps.QUALITY[key])
    else:
        for obj in objects:
            if obj.data.uv_layers:
                obj.data.uv_layers.remove(obj.data.uv_layers[0])
    groups = [levels[n][1] for n in ("lod0", "lod1", "lod2")]
    size = common.export_glb(OUT, objects + groups, texcoords=use_maps, normals=True)
    if use_maps:
        size = maps.attach(OUT, files, extras)
    # Positions as whole tenths of a millimetre, normals as bytes, texture coordinates as shorts
    size = pack_colours(OUT, unit=0.0001)
    print(f"digger: {OUT}, {size} bytes")
    preview = os.environ.get("TWISTY_PREVIEW")
    if preview:
        os.makedirs(preview, exist_ok=True)
        for obj, group in levels.values():
            obj.hide_render = obj is not levels["lod0"][0]
        scene = bpy.context.scene
        for name, eye in (("rear3q", (2.8, 2.4, -4.6)), ("front3q", (-3.0, 2.3, 4.8)), ("side", (5.6, 1.5, 0.2))):
            render(scene, os.path.join(preview, f"digger-{name}.png"), eye, (0, 1.0, 0), lens=50)
    if size > MAX_BYTES:
        raise SystemExit(f"digger: {size} bytes is over {MAX_BYTES}")


main()
