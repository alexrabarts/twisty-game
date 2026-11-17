# Helpers for the detailed bikes of group A (bike01_z650.py,
# bike02_speed_triple.py, bike03_duke390.py), on top of the shared kit
# (bike_kit.py, bike_parts.py). Shapes are in the game's axes: x across
# (+x the rider's right), y up, z forward, metres, ground at y = 0.
#
# A detailed bike file holds two levels of detail as two root nodes, `lod0`
# (hero: the rider select and the chase camera) and `lod1` (distance). Each
# holds the same node names as a plain bike file (body, wheel_front,
# wheel_rear, disc_front, disc_rear, fork_left, fork_right, handlebar,
# brake_light, headlight) and the bare marks grip, peg and seat. Both roots
# sit at the origin, so a node's translation is its place in the bike's axes.
# The file lists lod1's nodes before lod0's, so a reader that keys nodes by
# name alone (js/sceneassets.js today) ends up with lod0.
# The game draws +x on the rider's left, so it mirrors this kit's files as
# it loads them (BIKE_MODELS `mirror` in js/vehicle.js).
import json
import math
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import common  # noqa: E402
from bike_kit import Kit, B, euler, pack_colours, render  # noqa: E402

OUT_DIR = os.path.join(common.ASSETS, "bikes", "detail")
SCRATCH = os.environ.get("TWISTY_PREVIEW")

# Finishes the shared kit has no name for; the game takes these from the file
EXTRA = {
    "frame": (0x3A3D42, 0.42, 0.65),
    "frame_light": (0x8C9096, 0.4, 0.8),
    "titanium": (0xA7A49E, 0.28, 0.9),
    "anodised": (0x141519, 0.32, 0.7),
    "lens": (0xD8DCE0, 0.06, 0.6),
    "bag": (0x1C1D21, 0.85, 0.05),
}
NODES = ("body", "wheel_front", "wheel_rear", "disc_front", "disc_rear", "fork_left", "fork_right", "handlebar", "brake_light", "headlight")


def along(a, b, t):
    return tuple(p + (q - p) * t for p, q in zip(a, b))


def mirror_x(p):
    return (-p[0], p[1], p[2])


class KitA(Kit):
    """The shared kit with a level of detail: `lod` 0 or 1. At lod 1 parts
    smaller than `tiny` are left out and bevels are dropped."""

    def __init__(self, seed, colours=None):
        super().__init__(seed=seed)
        self.colours.update(EXTRA)
        for name, value in (colours or {}).items():
            self.colours[name] = (value,) + self.colours[name][1:]
        self.lod = 0
        self.tiny = 0.06

    def q(self, hi, lo):
        return hi if self.lod == 0 else lo

    def emit(self, verts, faces, mat, **kw):
        if self.lod:
            if self.node not in ("brake_light", "headlight"):
                spans = [max(v[axis] for v in verts) - min(v[axis] for v in verts) for axis in range(3)]
                if max(spans) < self.tiny:
                    return None
            kw["bevel"] = 0
        return super().emit(verts, faces, mat, **kw)

    # A box with its own axes: `frame` is a 4x4 matrix (game axes) and the
    # box's size and place are in that frame's x, y, z
    def fbox(self, frame, size, at, mat, bevel=0.004, **kw):
        sx, sy, sz = (s / 2 for s in size)
        verts = [frame @ (Vector(at) + Vector((x, y, z))) for z in (-sz, sz) for y in (-sy, sy) for x in (-sx, sx)]
        faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        return self.emit(verts, faces, mat, bevel=bevel, **kw)

    # A closed ring of section `profile` [(r, h)...] turned about x at `centre`
    def ring(self, centre, profile, mat, seg, **kw):
        return self.lathe(list(profile) + [profile[0]], centre, mat, axis="x", seg=seg, **kw)


# --- Wheels ---------------------------------------------------------------

def tyre(k, centre, radius, width, rim, grooves=True):
    seg = k.q(60, 20)
    tube = rim + 0.42 * (radius - rim)
    steps = k.q(10, 4)
    profile = [(rim - 0.004, -0.33 * width), (rim + 0.014, -0.42 * width)]
    for j in range(steps + 1):
        a = math.radians(-90 + 180 * j / steps)
        # A sport tyre: tall walls, a round crown
        r = tube + (radius - tube) * math.cos(a) ** 0.85 if abs(math.cos(a)) > 1e-6 else tube
        profile.append((r, math.sin(a) * width / 2))
    profile += [(rim + 0.014, 0.42 * width), (rim - 0.004, 0.33 * width)]

    def groove(i, j):
        row = j - 2
        if not grooves or k.lod or row < 2 or row > steps - 2 or row == steps // 2:
            return 0.0
        lean = row if row < steps // 2 else steps - row
        return -0.004 if (i + lean * 2) % 10 in (0, 1) else 0.0

    k.lathe(profile, centre, "rubber", axis="x", seg=seg, ripple=groove, sharp=50)


def rim_barrel(k, centre, width, rim, mat="rim"):
    w = width
    barrel = [(rim + 0.004, -0.39 * w), (rim + 0.008, -0.445 * w), (rim - 0.012, -0.45 * w), (rim - 0.03, -0.38 * w), (rim - 0.036, -0.12 * w),
              (rim - 0.036, 0.12 * w), (rim - 0.03, 0.38 * w), (rim - 0.012, 0.45 * w), (rim + 0.008, 0.445 * w), (rim + 0.004, 0.39 * w)]
    k.lathe(barrel, centre, mat, axis="x", seg=k.q(60, 20), sharp=40)


def rim_stripe(k, centre, width, rim, mat, band=0.006, sides=(-1, 1)):
    """A pinstripe on the outer face of each rim lip."""
    for side in sides:
        h0, h1 = side * 0.4505 * width, side * 0.4545 * width
        k.ring(centre, [(rim - 0.002 - band, h0), (rim - 0.002, h0), (rim - 0.002, h1), (rim - 0.002 - band, h1)], mat, seg=k.q(60, 20), sharp=60)


def blade(k, centre, a0, r0, a1, r1, half0, half1, deep0, deep1, mat, x=0.0, bevel=0.003):
    """A cast spoke from (angle a0, radius r0) to (a1, r1) round the axle."""
    verts = []
    for a, r, half, deep in ((a0, r0, half0, deep0), (a1, r1, half1, deep1)):
        out = Vector((0, math.cos(a), math.sin(a)))
        side = Vector((0, -math.sin(a), math.cos(a)))
        for dx in (-deep, deep):
            for dt in (-half, half):
                verts.append(Vector(centre) + out * r + side * dt + Vector((x + dx, 0, 0)))
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return k.emit(verts, faces, mat, bevel=bevel)


def spokes(k, centre, rim, hub, count=5, style="y", mat="rim", width=0.02, spread=0.2, twist=0.0):
    """Cast spokes. "y": a spoke that splits in two before the rim; "twin":
    pairs of slim spokes that leave the hub together and reach the rim apart;
    "single": one blade each."""
    inner = rim - 0.03
    for i in range(count):
        base = 2 * math.pi * i / count + twist
        if style == "y":
            split = hub + (inner - hub) * 0.48
            blade(k, centre, base, hub * 0.9, base, split + 0.01, width * 0.75, width * 0.62, 0.016, 0.012, mat)
            for side in (-1, 1):
                mid = split + (inner - split) * 0.5
                blade(k, centre, base, split, base + side * spread * 0.55, mid, width * 0.38, width * 0.34, 0.012, 0.01, mat)
                blade(k, centre, base + side * spread * 0.55, mid - 0.004, base + side * spread, inner + 0.008, width * 0.34, width * 0.38, 0.01, 0.011, mat)
        elif style == "twin":
            for side in (-1, 1):
                blade(k, centre, base + side * 0.06, hub * 0.9, base + side * spread, inner + 0.008, width * 0.42, width * 0.36, 0.014, 0.01, mat)
        else:
            blade(k, centre, base, hub * 0.9, base + spread, inner + 0.008, width * 0.7, width * 0.45, 0.018, 0.012, mat)


def hub(k, centre, width, radius=0.05, mat="rim", flange=None):
    seg = k.q(20, 10)
    k.lathe([(0, -width * 0.42), (radius * 0.7, -width * 0.42), (radius, -width * 0.3), (radius * 1.2, -0.012), (radius * 1.2, 0.012), (radius, width * 0.3),
             (radius * 0.7, width * 0.42), (0, width * 0.42)], centre, mat, axis="x", seg=seg)


# --- Brakes ---------------------------------------------------------------

def disc(k, centre, radius, style="round", carrier="dark_metal", arms=6, inner=0.66, thick=0.005, bobbins=True):
    """A brake disc about `centre` (its x is the disc's plane): a ring, waved
    for a petal disc, on a carrier of `arms` spokes and a boss."""
    cx, cy, cz = centre
    seg = k.q(72, 20)
    rin = radius * inner
    verts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        if style == "petal":
            wave = 0.5 + 0.5 * math.cos(a * 12)
            ro, ri = radius * (1 - 0.045 * wave), rin * (1 + 0.035 * wave)
        else:
            ro, ri = radius - (0.003 if i % 6 == 0 else 0), rin
        for r in (ri, ro):
            for dx in (-thick / 2, thick / 2):
                verts.append((cx + dx, cy + math.cos(a) * r, cz + math.sin(a) * r))
    faces = []
    for i in range(seg):
        a, b = i * 4, ((i + 1) % seg) * 4
        faces += [(a, b, b + 2, a + 2), (a + 1, a + 3, b + 3, b + 1), (a, a + 1, b + 1, b), (a + 2, b + 2, b + 3, a + 3)]
    k.emit(verts, faces, "disc", sharp=30)
    if k.lod == 0:
        for i in range(arms):
            a = 2 * math.pi * (i + 0.5) / arms
            r0, r1 = radius * 0.3, rin + 0.004
            blade(k, (cx, cy, cz), a, r0, a + 0.12, r1, 0.011, 0.008, thick * 0.8, thick * 0.7, carrier, bevel=0)
            if bobbins:
                b = 2 * math.pi * i / arms
                k.cylinder(0.0055, thick + 0.004, (cx, cy + math.cos(b) * rin, cz + math.sin(b) * rin), "steel", axis="x", seg=8)
    k.lathe([(0, -thick), (radius * 0.33, -thick), (radius * 0.33, thick), (0, thick)], centre, carrier, axis="x", seg=k.q(18, 10))


def caliper(k, axle, radius, angle, disc_x, mat="caliper", lug_mat="dark_metal", lug_to=None, size=1.0, pistons=2):
    """A caliper gripping a disc of `radius` in the plane x = disc_x, at
    `angle` round the axle (degrees from straight ahead, up over the top, so
    180 is straight behind). Its long side lies along the rim, its bridge
    over the disc's edge. `lug_to` (game axes) draws a mounting lug from the
    caliper's outer half to that point, in `lug_mat`."""
    a = math.radians(angle)
    theta = math.pi / 2 - a
    frame = Matrix.Translation(Vector((0, axle[0], axle[1]))) @ euler(theta, 0, 0)
    s = 1 if disc_x >= 0 else -1
    rc = radius * 0.84
    L = 0.11 * size
    # Local axes: x across (outboard is +s), y radially out, z along the rim
    def P(x, y, z):
        return frame @ Vector((disc_x + x, rc + y, z))

    k.fbox(frame, (0.024, 0.052 * size, L), (disc_x + s * 0.017, rc, 0), mat, bevel=0.007)
    k.fbox(frame, (0.016, 0.046 * size, L * 0.92), (disc_x - s * 0.015, rc, 0), mat, bevel=0.006)
    k.fbox(frame, (0.052, 0.014, L * 0.74), (disc_x, rc + 0.031 * size, 0), mat, bevel=0.005)
    if k.lod == 0:
        for n in range(pistons):
            z = (n - (pistons - 1) / 2) * L * 0.46
            k.cylinder(0.0145 * size, 0.008, tuple(P(s * 0.031, -0.002, z)), mat, axis="x", seg=12)
        # Pad pin and bleed nipple
        # Pad pin, outside the disc's edge
        k.rod(tuple(P(-s * 0.026, 0.036, -L * 0.1)), tuple(P(s * 0.03, 0.036, -L * 0.1)), 0.0025, "steel", seg=6)
        k.rod(tuple(P(s * 0.02, 0.026, L * 0.42)), tuple(P(s * 0.02, 0.038, L * 0.48)), 0.003, "steel", seg=6)
    if lug_to is not None:
        k.tube([tuple(P(s * 0.024, 0.012, -L * 0.3)), lug_to], 0.009, lug_mat, seg=6, smooth=1)
        k.tube([tuple(P(s * 0.024, 0.012, L * 0.3)), lug_to], 0.009, lug_mat, seg=6, smooth=1)
    return P


# --- Forks ----------------------------------------------------------------

def fork_pair(k, x, axle, top, pivot, usd, r_tube, outer_mat, inner_mat, foot_mat="dark_metal", cap_mat="anodised", adjust_mat=None,
              calipers=None, disc_x=None, disc_r=None, caliper_mat="caliper", caliper_angle=205, caliper_size=1.0, sides=(-1, 1), split=0.5):
    """Fork legs as their own nodes, fork_left and fork_right. `usd`: the thick
    tube on top. `calipers`: the sides (-1, 1) that carry one."""
    for side, name in ((-1, "fork_left"), (1, "fork_right")):
        k.begin(name, (side * pivot[0], pivot[1], pivot[2]))
        a = Vector((side * x, axle[0], axle[1]))
        b = Vector((side * x, top[0], top[1]))
        axis = (b - a).normalized()
        L = (b - a).length
        seg = k.q(18, 8)
        at = lambda t: tuple(a + axis * L * t)
        if usd:
            # Stanchion below, a dust seal, the thick outer tube to the top cap
            k.rod(at(0.05), at(split + 0.04), r_tube, inner_mat, seg=seg)
            k.lathe([(r_tube * 1.02, 0), (r_tube * 1.32, 0.004), (r_tube * 1.36, 0.022), (r_tube * 1.36, 0.03)], at(split - 0.04), "rubber", to=at(1), seg=seg)
            k.lathe([(0, 0), (r_tube * 1.36, 0), (r_tube * 1.42, L * 0.08), (r_tube * 1.42, L * (1 - split) * 0.9), (r_tube * 1.3, L * (1 - split) + 0.006), (0, L * (1 - split) + 0.006)],
                    at(split - 0.01), outer_mat, to=at(1.2), seg=seg)
            k.cylinder(r_tube * 1.18, 0.016, at(1.0 + 0.012 / L), cap_mat, seg=seg, rot=(0, 0, 0))
            if adjust_mat:
                k.cylinder(r_tube * 0.55, 0.014, at(1.0 + 0.028 / L), adjust_mat, seg=10)
            # Axle clamp: a foot ahead of the stanchion with the axle through it
            k.lathe([(0, -0.03), (r_tube * 1.25, -0.03), (r_tube * 1.3, 0.02), (r_tube * 1.08, 0.075), (0, 0.075)], tuple(a), foot_mat, to=at(1), seg=seg)
        else:
            k.lathe([(0, 0), (r_tube * 1.38, 0), (r_tube * 1.42, 0.03), (r_tube * 1.38, L * split), (r_tube * 1.2, L * split + 0.012), (0, L * split + 0.012)],
                    at(-0.04), outer_mat, to=at(1), seg=seg)
            k.rod(at(split - 0.02), at(1.0), r_tube, inner_mat, seg=seg)
            k.lathe([(r_tube * 1.02, 0), (r_tube * 1.3, 0.004), (r_tube * 1.3, 0.016)], at(split - 0.03), "rubber", to=at(1), seg=seg)
            k.cylinder(r_tube * 0.9, 0.014, at(1.0 + 0.01 / L), cap_mat, seg=10)
        k.box((r_tube * 2.4, 0.05, 0.05), tuple(a + Vector((0, -0.005, 0))), foot_mat, bevel=0.01)
        if calipers and side in calipers:
            dx = side * abs(disc_x)
            # The lugs reach forward to the fork foot, outboard of the disc
            foot = a + axis * 0.06 + Vector((side * 0.006, 0, -0.012))
            P = caliper(k, axle, disc_r, caliper_angle, dx, mat=caliper_mat, lug_mat=foot_mat, lug_to=tuple(foot), size=caliper_size, pistons=2)
            # Brake hose from the caliper up the back of the leg toward the bar,
            # kept outboard of the disc
            if k.lod == 0:
                start = P(side * 0.0 + (1 if dx > 0 else -1) * 0.022, 0.03, 0.03)
                behind = Vector((0, 0, -r_tube * 2.2))
                k.tube([start, Vector(at(0.25)) + behind + Vector((-side * 0.0, 0, 0)), Vector(at(0.55)) + behind * 1.2, Vector(at(0.95)) + behind * 1.6 + Vector((-side * 0.03, 0.02, 0))],
                       0.0045, "rubber", seg=6, smooth=3)


def yokes(k, x, axle, top, r_tube, offset=0.03, mat="dark_metal", lower_t=0.8, upper_extra=0.0):
    """Triple clamps, the steering stem and the axle, in the body."""
    a = Vector((0, axle[0], axle[1]))
    b = Vector((0, top[0], top[1]))
    axis = (b - a).normalized()
    L = (b - a).length
    back = Vector((0, -axis.z, axis.y)).normalized() * -1  # perpendicular, toward the rear
    lean = math.atan2(axis.z, axis.y)
    k.rod((-x - 0.025, axle[0], axle[1]), (x + 0.025, axle[0], axle[1]), 0.0095, "steel", seg=10)
    for t, deep, wide in ((0.985 + upper_extra, 0.026, 1.0), (lower_t, 0.04, 1.06)):
        c = a + axis * L * t
        # A clamp round each tube, a web between them back to the stem
        for side in (-1, 1):
            k.cylinder(r_tube * 1.5, deep, tuple(c + Vector((side * x, 0, 0))), mat, rot=(lean, 0, 0), seg=k.q(14, 8))
        k.fbox(Matrix.Translation(c) @ euler(lean, 0, 0), (x * 2 * wide, deep * 0.9, 0.07), (0, 0, -0.022 - offset * 0.5), mat, bevel=0.008)
    stem = a + axis * L * 0.9 + back * offset
    return stem, axis, back


# --- Rider controls -------------------------------------------------------

def bar_controls(k, g, root, side, lever_mat="steel", housing="dark_metal", reservoir=True, perch_mat="dark_metal"):
    out = (g - root).normalized()
    ahead = Vector((0, -0.2, 1)).normalized()
    up = out.cross(ahead).normalized()
    if up.y < 0:
        up = -up
    seg = k.q(12, 6)
    # Grip with a flange, a bar end
    k.rod(g - out * 0.065, g + out * 0.06, 0.017, "rubber", seg=seg)
    k.rod(g - out * 0.07, g - out * 0.062, 0.022, "rubber", seg=seg)
    k.rod(g + out * 0.06, g + out * 0.078, 0.019, housing, seg=seg)
    # Switch housing, lever perch, lever
    sw = g - out * 0.095
    k.fbox(Matrix.Translation(sw) @ Matrix((out, up, out.cross(up))).transposed().to_4x4(), (0.04, 0.045, 0.05), (0, 0, 0), housing, bevel=0.008)
    perch = g - out * 0.125 + ahead * 0.02
    k.cylinder(0.015, 0.03, tuple(perch), perch_mat, seg=seg)
    tip = g + out * 0.07 + ahead * 0.07 - up * 0.01
    k.tube([perch + ahead * 0.02, perch + ahead * 0.06 + out * 0.03, tip], 0.0055, lever_mat, seg=k.q(6, 4), smooth=2)
    if reservoir:
        if side > 0:
            # Front brake master cylinder and its fluid pot
            k.rod(perch - out * 0.01, perch - out * 0.06, 0.012, perch_mat, seg=seg)
            k.cylinder(0.016, 0.03, tuple(perch - out * 0.045 + up * 0.035 - ahead * 0.012), "glass", seg=seg)
        else:
            k.box((0.03, 0.03, 0.03), tuple(perch - out * 0.03), perch_mat, bevel=0.006)


# --- Assembly, export, preview -------------------------------------------

def assemble(k, suffix):
    joined = {}
    for name, objs in k.nodes.items():
        objs = [o for o in objs if o is not None]
        if not objs:
            continue
        common.select_only(objs, objs[0])
        if len(objs) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = name + suffix
        obj.data.name = name + suffix
        pivot = Vector(B(k.pivots[name]))
        obj.data.transform(Matrix.Translation(-pivot))
        obj.location = pivot
        joined[name] = obj
    k.nodes, k.pivots, k.node = {}, {}, None
    missing = [n for n in NODES if n not in joined]
    if missing:
        raise SystemExit(f"missing nodes {missing}")
    return joined


def triangles(objs):
    return sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)


def build(make, name, seed, colours, anchors, budgets=(40000, 10000), cap=1.2 * 1024 * 1024, alone=("wheel_front", "wheel_rear", "disc_front", "disc_rear"), views=None):
    """Builds both levels with make(k), bakes, exports and checks the file."""
    path = os.path.join(OUT_DIR, f"{name}.glb")
    k = KitA(seed, colours)
    k.lod = 0
    make(k)
    lod0 = assemble(k, "")
    k.lod = 1
    make(k)
    lod1 = assemble(k, ".lod1")
    for mine, other in ((lod0, lod1), (lod1, lod0)):
        for o in other.values():
            o.hide_render = True
        k.occlude(mine, alone)
        for o in other.values():
            o.hide_render = False
    roots = []
    for label, objs, suffix in (("lod0", lod0, ""), ("lod1", lod1, ".lod1")):
        root = bpy.data.objects.new(label, None)
        k.scene.collection.objects.link(root)
        for o in objs.values():
            o.parent = root
        for mark, at in anchors.items():
            m = bpy.data.objects.new(mark + suffix, None)
            m.location = B(at)
            k.scene.collection.objects.link(m)
            m.parent = root
        roots.append(root)
    every = [o for r in roots for o in [r] + list(r.children)]
    common.export_glb(path, every, colours=True, texcoords=False)
    pack_colours(path, unit=0.0002)
    size = settle(path)
    counts = {label: triangles(objs.values()) for label, objs in (("lod0", lod0), ("lod1", lod1))}
    per = {label: {n: triangles([o]) for n, o in objs.items()} for label, objs in (("lod0", lod0), ("lod1", lod1))}
    print(f"{name}.glb: {size} bytes, triangles {counts}")
    print(json.dumps(per))
    if counts["lod0"] > budgets[0] or counts["lod1"] > budgets[1]:
        raise SystemExit(f"{name}: triangles {counts} over {budgets}")
    if size > cap:
        raise SystemExit(f"{name}: {size} bytes is over {cap}")
    if SCRATCH:
        preview(k, name, lod0, lod1, views)
    return k, lod0, lod1


def settle(path):
    """Strips the `.lod1` suffix from node names and lists lod1's subtree
    first, so both levels carry the same names and lod0 is read last."""
    data = open(path, "rb").read()
    length = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + length])
    rest = data[20 + length:]
    nodes = doc["nodes"]
    index = {n["name"]: i for i, n in enumerate(nodes)}
    order = []
    for root in ("lod1", "lod0"):
        i = index[root]
        order.append(i)
        order += nodes[i].get("children", [])
    order += [i for i in range(len(nodes)) if i not in order]
    remap = {old: new for new, old in enumerate(order)}
    fresh = [nodes[i] for i in order]
    for n in fresh:
        if n["name"].endswith(".lod1"):
            n["name"] = n["name"][:-5]
        if "children" in n:
            n["children"] = [remap[c] for c in n["children"]]
        for key in ("rotation", "matrix"):
            if key in n:
                raise SystemExit(f"node {n['name']} has a {key}")
    doc["nodes"] = fresh
    for scene in doc["scenes"]:
        scene["nodes"] = sorted(remap[i] for i in scene["nodes"])
    for mesh in doc.get("meshes", []):
        mesh["name"] = mesh.get("name", "").replace(".lod1", "")
    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(text) + len(rest))
    out += struct.pack("<II", len(text), 0x4E4F534A) + text + rest
    open(path, "wb").write(out)
    return len(out)


VIEWS = {
    "right": ((5.2, 0.7, 0.0), (0, 0.55, 0.0), 58),
    "left": ((-5.2, 0.7, 0.0), (0, 0.55, 0.0), 58),
    "front34": ((2.7, 1.35, 3.3), (0, 0.55, 0.05), 58),
    "rear34": ((-2.7, 1.45, -3.3), (0, 0.55, -0.05), 58),
}


def gpu(scene):
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = "GPU"
    except Exception as error:  # noqa: BLE001
        print("no GPU:", error)


def preview(k, name, lod0, lod1, extra=None):
    os.makedirs(SCRATCH, exist_ok=True)
    views = dict(VIEWS)
    views.update(extra or {})
    only = os.environ.get("TWISTY_VIEWS")
    for label, mine, other in (("lod0", lod0, lod1), ("lod1", lod1, lod0)):
        if os.environ.get("TWISTY_LODS") and label not in os.environ["TWISTY_LODS"]:
            continue
        for o in other.values():
            o.hide_render = True
        for o in mine.values():
            o.hide_render = False
        for view, (eye, target, lens) in views.items():
            if only and view not in only.split(","):
                continue
            render(k.scene, os.path.join(SCRATCH, f"{name}-{label}-{view}.png"), eye, target, size=(1200, 800), lens=lens)
            k.scene.cycles.samples = 32
    for o in list(lod0.values()) + list(lod1.values()):
        o.hide_render = False


# --- Small detail for the hero level ------------------------------------

def chain(k, x, front, rear, pitch=0.0159):
    """Top and bottom runs between sprockets `front` and `rear`, each
    (y, z, radius): a plain strip at lod 1, link plates and rollers at lod 0."""
    for sign in (1, -1):
        a = Vector((x, front[0] + sign * front[2], front[1]))
        b = Vector((x, rear[0] + sign * rear[2], rear[1]))
        k.beam(tuple(a), tuple(b), (0.016, 0.012), "dark_metal", bevel=0)
        if k.lod == 0:
            n = int((b - a).length / pitch)
            for i in range(n):
                p = a + (b - a) * ((i + 0.5) / n)
                k.cylinder(0.0052, 0.012, tuple(p), "steel_dark", axis="x", seg=6)
    k.cylinder(front[2], 0.016, (x, front[0], front[1]), "steel_dark", axis="x", seg=k.q(14, 6))


def bolts(k, centre, radius, count, axis_x_sign, mat="steel", size=0.0055, phase=0.0):
    """A ring of bolt heads on a cover facing along x."""
    if k.lod:
        return
    cx, cy, cz = centre
    for i in range(count):
        a = phase + 2 * math.pi * i / count
        k.cylinder(size, 0.006, (cx + axis_x_sign * 0.003, cy + math.cos(a) * radius, cz + math.sin(a) * radius), mat, axis="x", seg=6)


def cable(k, points, radius=0.004, mat="rubber"):
    if k.lod == 0:
        k.tube([tuple(p) for p in points], radius, mat, seg=6, smooth=3)


def tail_pack(k, z0, z1, y0, y1, half, mat="bag", strap="dark_metal", straps=2):
    """A soft pack lying lengthwise on the pillion, its own node `luggage`:
    a rounded block with straps round it and a grab handle on top."""
    mid = (z0 + z1) / 2
    k.begin("luggage", (0, (y0 + y1) / 2, mid))
    h = y1 - y0
    k.loft([(z1, y0 + 0.02, y1 - 0.035, half * 0.8, 2.2, 3),
            (z1 - 0.04, y0, y1 - 0.005, half, 2.5, 3.6, 0.42, 0.85, 1),
            (z0 + 0.04, y0, y1, half * 1.02, 2.5, 3.6, 0.42, 0.85, 1),
            (z0, y0 + 0.02, y1 - 0.03, half * 0.82, 2.2, 3)], mat, ring=k.q(20, 10), steps=k.q(2, 1), sharp=40)
    for n in range(straps):
        z = z0 + (z1 - z0) * (n + 1) / (straps + 1)
        k.loft([(z + 0.012, y0 - 0.004, y1 + 0.003, half * 1.02 + 0.004, 2.5, 3.6, 0.42, 0.85, 1), (z - 0.012, y0 - 0.004, y1 + 0.003, half * 1.02 + 0.004, 2.5, 3.6, 0.42, 0.85, 1)],
               strap, ring=k.q(20, 10), steps=1)
        if k.lod == 0:
            for side in (-1, 1):
                k.box((0.008, 0.03, 0.036), (side * (half + 0.006), y0 + h * 0.45, z), "steel_dark", bevel=0.002)
                # A strap down to the subframe
                k.tube([(side * (half - 0.01), y0 + 0.01, z), (side * (half - 0.03), y0 - 0.06, z - 0.01)], 0.006, strap, seg=5)
    if k.lod == 0:
        k.tube([(0, y1, mid - 0.06), (0, y1 + 0.025, mid - 0.04), (0, y1 + 0.025, mid + 0.04), (0, y1, mid + 0.06)], 0.008, strap, seg=6, smooth=2)
