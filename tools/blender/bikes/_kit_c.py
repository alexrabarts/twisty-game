# Shared helpers for the detailed bikes of group C (bike07_mt09.py,
# bike08_xsr900.py, bike09_duke790.py), on top of the shared kit
# (tools/blender/bike_kit.py) and parts (bike_parts.py).
#
# A detailed bike file holds two levels of detail as two group nodes, `lod0`
# (the select screen and the chase camera) and `lod1` (distance). Each group
# holds the same nodes under the same names as a bike file of assets/bikes
# (body, wheel_front, wheel_rear, disc_front, disc_rear, fork_left,
# fork_right, handlebar, brake_light, headlight, luggage, and the bare marks
# grip, peg and seat), so the game can swap one group for the other. The group
# nodes stand at the origin with no transform, so a child's translation is its
# place in the bike's axes as in a flat file. lod1's nodes come first in the
# node list and lod0's last, so a reader that keys the nodes by name alone
# ends up with the detailed model (js/sceneassets.js reads each group by name).
#
# Positions are whole millimetres in signed shorts with the millimetre as each
# mesh node's scale (bike_kit.pack_colours does the same for one file), normals
# signed bytes, occlusion unsigned bytes.
# The game draws +x on the rider's left, so it mirrors this kit's files as
# it loads them (BIKE_MODELS `mirror` in js/vehicle.js).
import json
import math
import os
import struct
import sys

from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import bike_parts as parts  # noqa: E402
from bike_kit import Kit, euler, render  # noqa: E402
from common import ASSETS  # noqa: E402

OUT_DIR = os.path.join(ASSETS, "bikes", "detail")
# Wheel centres where Vehicle has them for every bike (js/vehicle.js)
FRONT, REAR = (0, 0.3, 0.7), (0, 0.3, -0.7)
LOD_BUDGET = (40000, 10000)
FILE_BUDGET = int(1.2 * 1024 * 1024)

# Finishes of the group's own, beside bike_kit.MATERIALS: (colour, roughness, metalness)
EXTRA = {
    "frame": (0x2A2C30, 0.5, 0.6),
    "gloss_black": (0x0C0D10, 0.12, 0.55),
    "matt_black": (0x15161A, 0.75, 0.25),
    "engine": (0x3A3D42, 0.5, 0.7),
    "cover": (0x8E939A, 0.32, 0.9),
    "seat_tan": (0x8A6A4C, 0.85, 0.0),
    "lens": (0x0E1116, 0.05, 0.6),
    "bronze": (0x7C5C44, 0.36, 0.85),
}


class DetailKit(Kit):
    """The shared kit with the group's finishes, and a level of detail."""

    def __init__(self, seed, colours, lod):
        super().__init__(seed=seed, colours={k: v for k, v in colours.items() if k not in EXTRA})
        self.lod = lod
        self.hi = lod == 0
        for name, value in EXTRA.items():
            self.colours[name] = value
        for name, value in colours.items():
            if name in EXTRA:
                self.colours[name] = (value,) + EXTRA[name][1:]

    def seg(self, hi, lo):
        return hi if self.hi else lo


# ---------------------------------------------------------------- shapes

def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def skin(k, outline, x_of, thick, mat, side, bevel=0.006, sharp=35):
    """A plate cut to a side-view outline of (z, y) points whose middle
    stands at x = side * x_of(z), so it can splay out along the bike."""
    n = len(outline)
    verts = []
    for layer in (-1, 1):
        for z, y in outline:
            verts.append((side * x_of(z) + layer * thick / 2, y, z))
    faces = [tuple(range(n)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, j + n, i + n))
    return k.emit(verts, faces, mat, bevel=bevel, sharp=sharp)


# ---------------------------------------------------------------- wheels

def wheel(k, centre, radius, width, rim, spokes=5, spread=0.2, blade=(0.012, 0.009), hub=0.05, curve=0.0, rim_mat="rim"):
    """A cast or forged road wheel spinning on x: a treaded tyre, the rim and
    `spokes` pairs of thin blades that leave the hub together and reach the
    rim `spread` radians apart (`curve` sweeps them)."""
    cx, cy, cz = centre
    seg = k.seg(40, 18)
    tube = rim + 0.4 * (radius - rim)
    steps = k.seg(10, 4)
    profile = [(rim - 0.004, -0.34 * width), (rim + 0.012, -0.42 * width)]
    for j in range(steps + 1):
        a = math.radians(-90 + 180 * j / steps)
        profile.append((tube + (radius - tube) * math.cos(a), math.sin(a) * width / 2))
    profile += [(rim + 0.012, 0.42 * width), (rim - 0.004, 0.34 * width)]

    def groove(i, j):
        row = j - 2
        if not k.hi or row < 2 or row > steps - 2 or row == steps // 2:
            return 0.0
        lean = row if row < steps // 2 else steps - row
        return -0.005 if (i + lean) % 5 == 0 else 0.0

    k.lathe(profile, centre, "rubber", axis="x", seg=seg, ripple=groove, sharp=50)
    w = width
    barrel = [(rim + 0.008, -0.42 * w), (rim + 0.008, -0.46 * w), (rim - 0.022, -0.42 * w), (rim - 0.032, -0.18 * w),
              (rim - 0.032, 0.18 * w), (rim - 0.022, 0.42 * w), (rim + 0.008, 0.46 * w), (rim + 0.008, 0.42 * w)]
    k.lathe(barrel if k.hi else barrel[1:-1], centre, rim_mat, axis="x", seg=k.seg(36, 14), sharp=40)
    inner = rim - 0.028
    for i in range(spokes):
        base = 2 * math.pi * i / spokes
        for side in (-1, 1):
            a0 = base + side * 0.07
            a1 = base + side * spread + curve
            mid = (a0 + a1) / 2 + curve * 0.4
            pts = [(a0, hub * 0.85, blade[0] * 1.5, 0.018), (mid, (hub + inner) / 2, blade[0], blade[1] * 1.3), (a1, inner + 0.008, blade[0] * 0.9, blade[1])]
            if not k.hi:
                pts = [pts[0], pts[2]]
            verts = []
            for a, r, half, deep in pts:
                out = Vector((0, math.cos(a), math.sin(a)))
                along = Vector((0, -math.sin(a), math.cos(a)))
                for dx in (-deep, deep):
                    for dt in (-half, half):
                        verts.append(Vector(centre) + out * r + along * dt + Vector((dx, 0, 0)))
            faces = []
            rings = len(pts)
            for n in range(rings - 1):
                a, b = n * 4, (n + 1) * 4
                faces += [(a, a + 1, b + 1, b), (a + 2, b + 2, b + 3, a + 3), (a, b, b + 2, a + 2), (a + 1, a + 3, b + 3, b + 1)]
            faces += [(0, 2, 3, 1), (len(verts) - 4, len(verts) - 3, len(verts) - 1, len(verts) - 2)]
            k.emit(verts, faces, rim_mat, sharp=40)
    k.lathe([(0, -width * 0.4), (hub, -width * 0.4), (hub * 1.2, -0.014), (hub * 1.2, 0.014), (hub, width * 0.4), (0, width * 0.4)],
            centre, rim_mat, axis="x", seg=k.seg(16, 8))
    if k.hi:
        # Valve and the spindle nut each side
        k.cylinder(0.004, 0.02, (cx + 0.02, cy + inner + 0.01, cz), "steel", seg=6)
        for side in (-1, 1):
            k.cylinder(0.016, 0.012, (cx + side * width * 0.42, cy, cz), "steel_dark", axis="x", seg=6)


def disc(k, centre, radius, holes=True, wave=False):
    """A floating brake disc on x: a thin ring (waved outer edge if `wave`),
    a carrier on bobbins and the boss that bolts to the hub. Thin across."""
    cx, cy, cz = centre
    inner = radius * 0.7
    seg = k.seg(48, 16)
    thick = 0.005
    verts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        outer = radius - (0.007 if wave and i % 4 == 0 else 0)
        for r in (inner, outer):
            for dx in (-thick / 2, thick / 2):
                verts.append((cx + dx, cy + math.cos(a) * r, cz + math.sin(a) * r))
    faces = []
    for i in range(seg):
        a, b = i * 4, ((i + 1) % seg) * 4
        faces += [(a, b, b + 2, a + 2), (a + 1, a + 3, b + 3, b + 1), (a, a + 1, b + 1, b), (a + 2, b + 2, b + 3, a + 3)]
    k.emit(verts, faces, "disc", sharp=30)
    if k.hi and holes:
        # Drillings as dark dots just proud of each face
        for i in range(16):
            a = 2 * math.pi * (i + 0.5) / 16
            r = (inner + radius) / 2 + (0.008 if i % 2 else -0.008)
            for side in ((1 if cx >= 0 else -1),):
                k.cylinder(0.0035, 0.001, (cx + side * (thick / 2 + 0.0004), cy + math.cos(a) * r, cz + math.sin(a) * r), "vent", axis="x", seg=6)
    arms = k.seg(6, 5)
    carrier = radius * 0.34
    for i in range(arms):
        a = 2 * math.pi * (i + 0.5) / arms
        mid = (inner + carrier) / 2
        k.box((thick * 1.6, inner - carrier + 0.01, 0.02), (cx, cy + math.cos(a) * mid, cz + math.sin(a) * mid), "dark_metal", rot=(a, 0, 0), bevel=0)
        if k.hi:
            k.cylinder(0.0065, thick * 2.2, (cx, cy + math.cos(a) * inner, cz + math.sin(a) * inner), "steel", axis="x", seg=8)
    k.lathe([(0, -thick), (carrier, -thick), (carrier, thick), (0, thick)], centre, "dark_metal", axis="x", seg=k.seg(18, 10))


def caliper(k, at, radius, angle, mat="caliper", size=(0.105, 0.05)):
    """A radial four-piston caliper gripping a disc of `radius` whose centre
    is `at`, at `angle` round it from straight ahead, up over the top: two
    halves either side of the disc, a bridge over the rim and the pad pins."""
    x, y, z = at
    r = radius * 0.86
    length, deep = size
    roll = math.pi / 2 - angle
    place = Vector((x, y + math.sin(angle) * r, z + math.cos(angle) * r))
    out = Vector((0, math.sin(angle), math.cos(angle)))
    for side, thick in ((-1, 0.02), (1, 0.024)):
        k.box((thick, deep, length), place + Vector((side * (0.006 + thick / 2), 0, 0)), mat, rot=(roll, 0, 0), bevel=k.seg(0.008, 0))
    k.box((0.05, 0.016, length * 0.82), place + out * (deep / 2 + 0.002), mat, rot=(roll, 0, 0), bevel=k.seg(0.005, 0))
    if k.hi:
        for t in (-0.3, 0.3):
            along = Vector((0, math.cos(angle + math.pi / 2), math.sin(angle + math.pi / 2)))
            p = place + along * (t * length) + out * (deep / 2 + 0.012)
            # Pad pins cross the disc, so they are part of the caliper
            k.cylinder(0.005, 0.056, tuple(p), mat, axis="x", seg=6)


# ---------------------------------------------------------------- front end

def rake_point(axle, y, rake):
    """Where the fork line through `axle` (y, z) is at height `y`, raked back by `rake` radians."""
    return (y, axle[1] - (y - axle[0]) * math.tan(rake))


def usd_forks(k, x, axle, top, rake, outer=0.028, inner=0.021, outer_mat="fork_gold", inner_mat="chrome", foot_mat="dark_metal",
              disc_x=0.064, disc_radius=0.149, caliper_angle=205, pivot=None, caps="steel", slider_frac=0.38):
    """Upside-down forks as the two leg nodes: the thin stanchion below with
    the axle foot and the radial caliper mount, the thick outer tube above
    into the clamps, the preload cap on top."""
    a0 = Vector((0, axle[0], axle[1]))
    t0 = Vector((0, top, rake_point(axle, top, rake)[1]))
    pivot = pivot or ((a0 + t0) / 2)
    for side, name in ((-1, "fork_left"), (1, "fork_right")):
        k.begin(name, (side * x, pivot[1], pivot[2]))
        a = Vector((side * x, a0.y, a0.z))
        b = Vector((side * x, t0.y, t0.z))
        along = (b - a).normalized()
        foot_top = a + along * 0.075
        k.rod(tuple(a + along * 0.02), tuple(a + along * (0.075 + slider_frac * (b - a).length)), inner, inner_mat, seg=k.seg(16, 8))
        k.rod(tuple(a + along * (0.06 + slider_frac * (b - a).length)), tuple(b + along * 0.02), outer, outer_mat, seg=k.seg(20, 10))
        if k.hi:
            # Seal ring and dust wiper at the bottom of the outer tube
            k.rod(tuple(a + along * (0.06 + slider_frac * (b - a).length)), tuple(a + along * (0.075 + slider_frac * (b - a).length)), outer + 0.002, "rubber", seg=16)
            k.cylinder(outer * 0.62, 0.016, tuple(b + along * 0.03), caps, seg=12, rot=(-rake, 0, 0))
        # Axle foot: a bulky clamp round the spindle, outboard of the disc
        k.lathe([(0, -0.03), (0.028, -0.03), (0.028, 0.03), (0, 0.03)], tuple(a + Vector((side * 0.006, 0, 0))), foot_mat, axis="x", seg=k.seg(14, 8))
        k.beam(tuple(a + Vector((side * 0.006, 0, 0))), tuple(foot_top + Vector((side * 0.006, 0, 0))), (0.054, 0.05), foot_mat, bevel=k.seg(0.008, 0))
        # Caliper lugs behind the leg, then the caliper on its disc
        ang = math.radians(caliper_angle)
        r = disc_radius * 0.86
        lug_at = Vector((side * (x - 0.008), axle[0] + math.sin(ang) * r, axle[1] + math.cos(ang) * r))
        for t in (-0.035, 0.035):
            tangent = Vector((0, math.cos(ang + math.pi / 2), math.sin(ang + math.pi / 2)))
            p = lug_at + tangent * t
            k.beam(tuple(Vector((side * x, p.y, p.z)) + Vector((0, 0.0, 0.0))), tuple(Vector((side * (abs(disc_x) + 0.03), p.y, p.z))), (0.018, 0.018), "dark_metal", bevel=0)
        caliper(k, (side * abs(disc_x), axle[0], axle[1]), disc_radius, ang)
    k.begin("body")
    k.rod((-x - 0.035, axle[0], axle[1]), (x + 0.035, axle[0], axle[1]), 0.012, "steel", seg=8)
    return t0


def clamps(k, x, axle, top, bottom, rake, outer, mat="dark_metal", width_extra=0.05):
    """Top and bottom yokes across both outer tubes."""
    for y, deep, h in ((top, 0.12, 0.028), (bottom, 0.1, 0.04)):
        yy, zz = rake_point(axle, y, rake)
        k.box((x * 2 + outer * 2 + width_extra, h, deep), (0, yy, zz - deep * 0.25), mat, rot=(-rake, 0, 0), bevel=k.seg(0.01, 0))
    # Steering stem nut on the top yoke
    yy, zz = rake_point(axle, top, rake)
    if k.hi:
        k.cylinder(0.018, 0.012, (0, yy + 0.02, zz - 0.035), "steel", seg=10)


def handlebar(k, grip, clamp, rise, width_bend=0.42, mat="dark_metal", radius=0.0125, mirrors=None, bar_end_mirrors=None, lever_mat="steel_dark",
              risers=True, master=True):
    """A one-piece tapered bar on risers, with grips, bar ends, switchgear,
    levers with their perches, the front master cylinder on the right and the
    clutch perch on the left. `mirrors` is (root, head) on the bar,
    `bar_end_mirrors` a radius for round mirrors on the bar ends."""
    cy, cz = clamp
    hi = k.hi
    for side in (-1, 1):
        g = Vector((side * grip[0], grip[1], grip[2]))
        bend = Vector((side * grip[0] * width_bend, cy + rise, cz + (grip[2] - cz) * 0.4))
        k.tube([(0, cy + rise * 0.6, cz), (side * 0.06, cy + rise * 0.8, cz), bend, g - Vector((side * 0.075, 0, 0)), g + Vector((side * 0.065, 0, 0))],
               radius, mat, seg=k.seg(10, 6), smooth=k.seg(3, 1))
        if risers:
            k.cylinder(0.017, 0.05, (side * 0.045, cy + 0.01, cz), "steel_dark", seg=k.seg(10, 6))
        out = Vector((side, 0, 0))
        ahead = Vector((0, -0.2, 1)).normalized()
        k.rod(tuple(g - out * 0.065), tuple(g + out * 0.062), 0.0175, "rubber", seg=k.seg(12, 6), sharp=60)
        if hi:
            for n in range(5):
                k.cylinder(0.0185, 0.004, tuple(g - out * (0.05 - n * 0.022)), "rubber", axis="x", seg=12)
        # Switch pods inboard of the grips
        k.box((0.04, 0.045, 0.05), tuple(g - out * 0.095 + Vector((0, 0.006, 0.004))), "matt_black", bevel=k.seg(0.008, 0))
        # Lever: from the perch forward, then out along under the grip
        perch = g - out * 0.115 + ahead * 0.02
        if hi:
            k.box((0.03, 0.03, 0.03), tuple(perch), "matt_black", bevel=0.005)
        k.tube([tuple(perch + ahead * 0.02), tuple(perch + ahead * 0.055 + out * 0.03), tuple(g + out * 0.05 + ahead * 0.07 - Vector((0, 0.01, 0)))],
               0.0055, lever_mat, seg=k.seg(6, 4), smooth=k.seg(2, 1))
        if master and side > 0:
            k.cylinder(0.014, 0.05, tuple(perch + Vector((0, 0.01, -0.01))), "matt_black", axis="x", seg=k.seg(10, 6))
            k.box((0.035, 0.03, 0.03), tuple(perch + Vector((-0.03, 0.04, -0.02))), "matt_black", bevel=k.seg(0.005, 0))
        if master and side < 0 and hi:
            k.cylinder(0.012, 0.04, tuple(perch + Vector((0, 0.008, -0.008))), "matt_black", axis="x", seg=8)
        if bar_end_mirrors:
            # A stalk off the bar end, out and back to a round glass
            r = bar_end_mirrors
            end = g + out * 0.07
            head = end + Vector((side * 0.07, 0.02, -0.03))
            k.tube([tuple(end), tuple(end + Vector((side * 0.035, 0.0, -0.005))), tuple(head)], 0.008, "matt_black", seg=k.seg(8, 5), smooth=k.seg(2, 1))
            k.cylinder(r, 0.018, tuple(head + Vector((0, 0.04, 0))), "matt_black", axis="z", seg=k.seg(20, 8))
            if hi:
                k.cylinder(r * 0.88, 0.003, tuple(head + Vector((0, 0.04, -0.009))), "glass", axis="z", seg=20)
            k.rod(tuple(head), tuple(head + Vector((0, 0.03, 0))), 0.007, "matt_black", seg=6)
        else:
            k.rod(tuple(g + out * 0.062), tuple(g + out * 0.08), 0.02, "steel_dark", seg=k.seg(10, 6))
    if mirrors:
        root, head, size = mirrors
        for side in (-1, 1):
            a = (side * root[0], root[1], root[2])
            b = (side * head[0], head[1], head[2])
            k.tube([a, parts.along(a, b, 0.5), b], 0.006, "matt_black", seg=k.seg(6, 4))
            w, h = size
            bx, by, bz = b
            k.loft([(bz - 0.016, by - h * 0.5, by + h * 0.5, w * 0.5, 2.4, 2.4, 0.5, 1, 1, bx),
                    (bz - 0.008, by - h, by + h, w, 3, 3, 0.5, 1, 1, bx),
                    (bz + 0.01, by - h * 0.95, by + h * 0.95, w * 0.95, 3, 3, 0.5, 1, 1, bx),
                    (bz + 0.018, by - h * 0.4, by + h * 0.4, w * 0.4, 2.4, 2.4, 0.5, 1, 1, bx)], "matt_black", ring=k.seg(12, 6), steps=1)
            if k.hi:
                k.box((w * 1.7, h * 1.7, 0.002), (bx, by, bz - 0.0175), "glass", bevel=0)


# ---------------------------------------------------------------- drive

def sprocket(k, centre, x, radius, teeth=42):
    if not k.hi:
        k.cylinder(radius, 0.008, (centre[0] + x, centre[1], centre[2]), "steel_dark", axis="x", seg=12)
        return
    k.lathe([(radius * 0.45, -0.004), (radius, -0.004), (radius, 0.004), (radius * 0.45, 0.004)], (centre[0] + x, centre[1], centre[2]), "steel_dark", axis="x",
            seg=teeth, ripple=lambda i, j: 0.006 if (j in (1, 2) and i % 2) else 0.0, sharp=20)
    k.lathe([(0, -0.006), (radius * 0.47, -0.006), (radius * 0.47, 0.006), (0, 0.006)], (centre[0] + x, centre[1], centre[2]), "dark_metal", axis="x", seg=12)


def chain(k, x, front, rear):
    """Chain runs between the sprockets, `front`/`rear` as (y, z, radius), link plates on the detailed model."""
    for sign in (1, -1):
        a = Vector((x, front[0] + sign * front[2], front[1]))
        b = Vector((x, rear[0] + sign * rear[2], rear[1]))
        k.beam(tuple(a), tuple(b), (0.016, 0.014), "steel_dark", bevel=0)
        if k.hi:
            n = int((b - a).length / 0.032)
            for i in range(1, n):
                p = a.lerp(b, i / n)
                k.box((0.019, 0.017, 0.012), tuple(p), "dark_metal", rot=(math.atan2(b.y - a.y, b.z - a.z) * -1, 0, 0), bevel=0)
    k.cylinder(front[2], 0.016, (x, front[0], front[1]), "steel_dark", axis="x", seg=k.seg(16, 8))


def shock(k, a, b, radius, spring_mat="spring", body_mat="steel_dark"):
    length = (Vector(b) - Vector(a)).length
    coils = k.seg(8, 0)
    if coils:
        profile = [(radius * (1.0 if n % 2 else 0.72), length * (0.18 + 0.64 * n / (coils * 2))) for n in range(coils * 2 + 1)]
        k.lathe(profile, a, spring_mat, to=b, seg=10, sharp=80)
    else:
        k.rod(parts.along(a, b, 0.18), parts.along(a, b, 0.82), radius, spring_mat, seg=6)
    k.rod(a, b, radius * 0.45, "chrome", seg=k.seg(8, 5))
    k.rod(a, parts.along(a, b, 0.2), radius * 0.9, body_mat, seg=k.seg(10, 6))


def pegs(k, peg, hanger_mat="dark_metal", hanger=None, heel_plate=True, peg_mat="steel", plate_shape=None):
    """Footpegs both sides at `peg` (right side), knurled on the detailed
    model, on hangers with heel plates, and the gear lever and brake pedal."""
    for side in (-1, 1):
        x, y, z = side * peg[0], peg[1], peg[2]
        k.rod((x - side * 0.03, y, z), (x + side * 0.075, y, z), 0.012, peg_mat, seg=k.seg(10, 6))
        if k.hi:
            for n in range(5):
                k.box((0.008, 0.006, 0.03), (x + side * (0.005 + n * 0.014), y + 0.011, z), "rubber", bevel=0)
        if heel_plate:
            shape = plate_shape or [(0.04, -0.02), (-0.02, -0.04), (-0.12, 0.02), (-0.15, 0.12), (-0.08, 0.14), (0.02, 0.06)]
            k.panel([(z + dz, y + dy) for dz, dy in shape], x - side * 0.035, 0.008, hanger_mat, bevel=k.seg(0.003, 0))
        if hanger:
            k.beam((x - side * 0.04, hanger[0], hanger[1]), (x - side * 0.04, y, z), (0.012, 0.035), hanger_mat, bevel=k.seg(0.004, 0))
    # Gear lever on the left, its toe peg, and the brake pedal on the right
    gx = -peg[0] - 0.02
    k.tube([(gx, peg[1] + 0.03, peg[2] - 0.01), (gx - 0.005, peg[1] - 0.005, peg[2] + 0.1), (gx - 0.01, peg[1] + 0.01, peg[2] + 0.17)], 0.006, "steel_dark", seg=k.seg(6, 4))
    k.rod((gx - 0.01, peg[1] + 0.01, peg[2] + 0.17), (gx - 0.05, peg[1] + 0.01, peg[2] + 0.17), 0.008, "steel", seg=k.seg(8, 4))
    bx = peg[0] + 0.01
    k.tube([(bx, peg[1] + 0.01, peg[2] - 0.02), (bx + 0.005, peg[1] - 0.03, peg[2] + 0.1), (bx + 0.01, peg[1] - 0.02, peg[2] + 0.16)], 0.006, "steel_dark", seg=k.seg(6, 4))
    k.box((0.04, 0.012, 0.03), (bx + 0.025, peg[1] - 0.018, peg[2] + 0.165), "steel", bevel=k.seg(0.004, 0))


def indicator(k, at, side, stalk=0.05, mat_body="matt_black", lens_size=(0.03, 0.016, 0.022), angle=0.0):
    x, y, z = at
    end = (x + side * stalk, y, z + stalk * math.sin(angle))
    k.rod(at, end, 0.006, mat_body, seg=k.seg(6, 4))
    k.box(lens_size, end, "signal", bevel=k.seg(0.005, 0))


def plate(k, at, tilt, size=(0.17, 0.12)):
    """A blank number plate on a backing frame."""
    k.box((size[0] + 0.012, size[1] + 0.012, 0.006), at, "matt_black", rot=(tilt, 0, 0), bevel=k.seg(0.003, 0))
    back = Vector(at) + (euler(tilt, 0, 0) @ Vector((0, 0, -0.004)))
    k.box((size[0], size[1], 0.003), tuple(back), "plate", rot=(tilt, 0, 0), bevel=0)


def bag(k, centre, size, mat="luggage", round_=2.8, strap_mat="matt_black", straps=2):
    """A soft bag: a rounded block with webbing straps over it."""
    cx, cy, cz = centre
    sx, sy, sz = size
    k.loft([(cz - sz / 2, cy - sy * 0.45, cy + sy * 0.45, sx * 0.4, round_, round_),
            (cz - sz / 2 + 0.03, cy - sy / 2, cy + sy / 2, sx / 2, round_, round_),
            (cz + sz / 2 - 0.03, cy - sy / 2, cy + sy / 2, sx / 2, round_, round_),
            (cz + sz / 2, cy - sy * 0.45, cy + sy * 0.45, sx * 0.4, round_, round_)], mat, ring=k.seg(18, 8), steps=k.seg(2, 1))
    if k.hi:
        for n in range(straps):
            z = cz - sz / 2 + sz * (n + 1) / (straps + 1)
            k.loft([(z - 0.012, cy - sy / 2 - 0.004, cy + sy / 2 + 0.004, sx / 2 + 0.004, round_, round_),
                    (z + 0.012, cy - sy / 2 - 0.004, cy + sy / 2 + 0.004, sx / 2 + 0.004, round_, round_)], strap_mat, ring=18, steps=1)


# ---------------------------------------------------------------- engines

def radiator(k, centre, size, tilt, core="vent", frame_mat="matt_black", fins=True):
    """A radiator core in a frame, tilted back by `tilt`, with a fan behind on the detailed model."""
    w, h, d = size
    k.box((w + 0.02, h + 0.02, d), centre, frame_mat, rot=(tilt, 0, 0), bevel=k.seg(0.006, 0))
    front = Vector(centre) + euler(tilt, 0, 0) @ Vector((0, 0, d / 2 + 0.001))
    k.box((w, h, 0.004), tuple(front), core, rot=(tilt, 0, 0), bevel=0)
    if k.hi and fins:
        n = int(h / 0.012)
        for i in range(n):
            p = Vector(centre) + euler(tilt, 0, 0) @ Vector((0, -h / 2 + (i + 0.5) * h / n, d / 2 + 0.003))
            k.box((w, 0.002, 0.003), tuple(p), "steel_dark", rot=(tilt, 0, 0), bevel=0)
        back = Vector(centre) + euler(tilt, 0, 0) @ Vector((0, 0, -d / 2 - 0.012))
        k.cylinder(h * 0.36, 0.022, tuple(back), "matt_black", rot=(tilt + math.pi / 2, 0, 0), seg=16)


def inline_triple(k, crank, case_mat="engine", cover_mat="cover", head_mat="engine", cam_mat="matt_black", tilt=0.35):
    """An inline three in the manner of the 890 cc crossplane triple: a deep
    crankcase, three cylinders in one block leaning forward, the head and its
    cam cover, the clutch cover on the right, the alternator cover on the
    left and the sump. `crank` is (y, z) of the crankshaft."""
    cy, cz = crank
    hi = k.hi
    # Crankcase: lofted along the bike so its belly rounds off
    k.loft([(cz + 0.14, cy - 0.06, cy + 0.06, 0.15, 3, 3),
            (cz + 0.1, cy - 0.12, cy + 0.08, 0.2, 3.5, 3),
            (cz - 0.06, cy - 0.15, cy + 0.08, 0.2, 3.5, 3),
            (cz - 0.2, cy - 0.12, cy + 0.06, 0.17, 3, 3),
            (cz - 0.25, cy - 0.06, cy + 0.04, 0.12, 3, 3)], case_mat, ring=k.seg(18, 10), steps=k.seg(2, 1))
    # Sump under it
    k.box((0.26, 0.06, 0.24), (0, cy - 0.17, cz - 0.02), case_mat, bevel=k.seg(0.015, 0))
    # Cylinder block, head and cam cover, leaning forward
    turn = euler(tilt, 0, 0)
    base = Vector((0, cy + 0.07, cz + 0.07))
    block_c = base + turn @ Vector((0, 0.1, 0))
    k.box((0.36, 0.2, 0.17), tuple(block_c), case_mat, rot=(tilt, 0, 0), bevel=k.seg(0.012, 0))
    head_c = base + turn @ Vector((0, 0.23, 0))
    k.box((0.38, 0.09, 0.19), tuple(head_c), head_mat, rot=(tilt, 0, 0), bevel=k.seg(0.012, 0))
    cam_c = base + turn @ Vector((0, 0.3, 0))
    k.box((0.35, 0.055, 0.17), tuple(cam_c), cam_mat, rot=(tilt, 0, 0), bevel=k.seg(0.015, 0))
    if hi:
        # Ribs across the block and plug caps on the cam cover
        for n in range(4):
            p = base + turn @ Vector((0, 0.04 + n * 0.035, 0.087))
            k.box((0.33, 0.006, 0.006), tuple(p), case_mat, rot=(tilt, 0, 0), bevel=0)
        for xx in (-0.1, 0, 0.1):
            p = base + turn @ Vector((xx, 0.33, 0))
            k.cylinder(0.018, 0.012, tuple(p), "matt_black", rot=(tilt, 0, 0), seg=10)
        # Bolts round the cam cover
        for xx in (-0.15, -0.05, 0.05, 0.15):
            for zz in (-0.07, 0.07):
                p = base + turn @ Vector((xx, 0.326, zz))
                k.cylinder(0.006, 0.008, tuple(p), "steel", rot=(tilt, 0, 0), seg=6)
    # Exhaust ports' flanges on the front of the head
    for xx in (-0.1, 0, 0.1):
        p = base + turn @ Vector((xx, 0.22, 0.1))
        k.cylinder(0.024, 0.02, tuple(p), "steel_dark", rot=(tilt + math.pi / 2, 0, 0), seg=k.seg(10, 6))
    # Clutch cover (right), alternator cover (left), front sprocket cover (left)
    k.lathe([(0, 0), (0.112, 0), (0.112, 0.022), (0.095, 0.045), (0.06, 0.056), (0, 0.056)], (0.19, cy - 0.01, cz - 0.07), cover_mat, axis="x", seg=k.seg(24, 10))
    k.lathe([(0, 0), (0.075, 0), (0.075, 0.018), (0.06, 0.035), (0, 0.04)], (-0.19, cy + 0.01, cz + 0.04), cover_mat, axis="x", rot=(0, 0, math.pi), seg=k.seg(22, 10))
    k.box((0.03, 0.1, 0.13), (-0.2, cy - 0.04, cz - 0.17), cover_mat, bevel=k.seg(0.012, 0))
    if hi:
        # Covers' bolt rings and the oil filler / sight glass
        for i in range(8):
            a = 2 * math.pi * i / 8
            k.cylinder(0.006, 0.006, (0.243, cy - 0.01 + math.cos(a) * 0.1, cz - 0.07 + math.sin(a) * 0.1), "steel", axis="x", seg=6)
            k.cylinder(0.005, 0.006, (-0.23, cy + 0.01 + math.cos(a) * 0.066, cz + 0.04 + math.sin(a) * 0.066), "steel", axis="x", seg=6)
        k.cylinder(0.022, 0.012, (0.25, cy - 0.01, cz - 0.07), "matt_black", axis="x", seg=12)
        k.cylinder(0.035, 0.08, (0.04, cy - 0.06, cz + 0.17), "matt_black", axis="z", seg=12)


def parallel_twin(k, crank, case_mat="engine", cover_mat="cover", head_mat="engine", cam_mat="matt_black", tilt=0.18):
    """A compact parallel twin in the manner of the LC8c: a short case, the
    two cylinders nearly upright and slim, a tall head, clutch cover on the
    right, alternator cover on the left."""
    cy, cz = crank
    hi = k.hi
    k.loft([(cz + 0.13, cy - 0.06, cy + 0.06, 0.12, 3, 3),
            (cz + 0.09, cy - 0.11, cy + 0.08, 0.17, 3.5, 3),
            (cz - 0.07, cy - 0.13, cy + 0.08, 0.17, 3.5, 3),
            (cz - 0.18, cy - 0.1, cy + 0.06, 0.14, 3, 3),
            (cz - 0.22, cy - 0.05, cy + 0.04, 0.1, 3, 3)], case_mat, ring=k.seg(18, 10), steps=k.seg(2, 1))
    turn = euler(tilt, 0, 0)
    base = Vector((0, cy + 0.07, cz + 0.06))
    k.box((0.25, 0.18, 0.13), tuple(base + turn @ Vector((0, 0.09, 0))), case_mat, rot=(tilt, 0, 0), bevel=k.seg(0.012, 0))
    k.box((0.27, 0.08, 0.15), tuple(base + turn @ Vector((0, 0.21, 0))), head_mat, rot=(tilt, 0, 0), bevel=k.seg(0.012, 0))
    k.box((0.24, 0.05, 0.13), tuple(base + turn @ Vector((0, 0.27, 0))), cam_mat, rot=(tilt, 0, 0), bevel=k.seg(0.015, 0))
    if hi:
        for n in range(5):
            k.box((0.255, 0.005, 0.135), tuple(base + turn @ Vector((0, 0.03 + n * 0.03, 0))), "steel_dark", rot=(tilt, 0, 0), bevel=0)
        for xx in (-0.06, 0.06):
            k.cylinder(0.016, 0.012, tuple(base + turn @ Vector((xx, 0.3, 0))), "matt_black", rot=(tilt, 0, 0), seg=10)
    for xx in (-0.06, 0.06):
        k.cylinder(0.024, 0.02, tuple(base + turn @ Vector((xx, 0.2, 0.08))), "steel_dark", rot=(tilt + math.pi / 2, 0, 0), seg=k.seg(10, 6))
    k.lathe([(0, 0), (0.09, 0), (0.09, 0.02), (0.075, 0.038), (0.045, 0.046), (0, 0.046)], (0.16, cy, cz - 0.06), cover_mat, axis="x", seg=k.seg(24, 10))
    k.lathe([(0, 0), (0.07, 0), (0.07, 0.018), (0.055, 0.032), (0, 0.036)], (-0.16, cy + 0.01, cz + 0.03), cover_mat, axis="x", rot=(0, 0, math.pi), seg=k.seg(22, 10))
    k.box((0.03, 0.09, 0.12), (-0.17, cy - 0.03, cz - 0.15), cover_mat, bevel=k.seg(0.012, 0))
    if hi:
        for i in range(8):
            a = 2 * math.pi * i / 8
            k.cylinder(0.006, 0.006, (0.208, cy + math.cos(a) * 0.08, cz - 0.06 + math.sin(a) * 0.08), "steel", axis="x", seg=6)
        k.cylinder(0.03, 0.07, (0.02, cy - 0.06, cz + 0.16), "matt_black", axis="z", seg=12)


# ---------------------------------------------------------------- file

def build_file(name, build, seed, colours, anchors):
    """Builds the two levels of detail with `build(k)` and writes them as one file."""
    tmp = []
    counts = []
    for lod in (0, 1):
        k = DetailKit(seed, colours, lod)
        build(k)
        path = os.path.join(OUT_DIR, f".{name}-lod{lod}.glb")
        k.finish(path, anchors=anchors, budget=LOD_BUDGET[lod], alone=("wheel_front", "wheel_rear", "disc_front", "disc_rear"))
        counts.append(sum(k.triangles([o]) for o in k.joined.values()))
        tmp.append(path)
        if lod == 0:
            preview(k, name)
    out = os.path.join(OUT_DIR, f"{name}.glb")
    size = merge(tmp, out)
    for path in tmp:
        os.remove(path)
    print(f"{name}.glb: lod0 {counts[0]} triangles, lod1 {counts[1]} triangles, {size} bytes")
    if size > FILE_BUDGET:
        raise SystemExit(f"{out}: {size} bytes is over the budget of {FILE_BUDGET}")
    return out


def preview(k, name):
    out = os.environ.get("TWISTY_PREVIEW")
    if not out:
        return
    for view, (eye, target) in {"side": ((4.6, 0.8, 0.0), (0, 0.6, 0.0)), "front": ((2.4, 1.5, 3.4), (0, 0.55, 0.0)), "rear": ((-2.4, 1.5, -3.4), (0, 0.55, 0.0))}.items():
        render(k.scene, os.path.join(out, f"{name}-{view}.png"), eye, target, lens=62)


def _read(path):
    data = open(path, "rb").read()
    length = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + length])
    return doc, data[20 + length + 8:]


SIZES = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
FORMATS = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}


def _values(doc, binary, index):
    accessor = doc["accessors"][index]
    view = doc["bufferViews"][accessor["bufferView"]]
    width = SIZES[accessor["type"]]
    code = FORMATS[accessor["componentType"]]
    item = struct.calcsize("<" + code)
    stride = view.get("byteStride", width * item)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    out = []
    for i in range(accessor["count"]):
        out.append(struct.unpack_from(f"<{width}{code}", binary, start + i * stride))
    return out


def merge(paths, out, unit=0.001):
    """Two single-level files (lod0, lod1) as one file with a group node for
    each, positions in whole `unit`s as signed shorts."""
    docs = [_read(p) for p in paths]
    chunks = []
    offset = 0
    views, accessors, meshes, nodes, materials = [], [], [], [], []
    names = {}

    def add(blob, stride=None):
        nonlocal offset
        blob += b"\0" * (-len(blob) % 4)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(blob)}
        if stride:
            view["byteStride"] = stride
        views.append(view)
        chunks.append(blob)
        offset += len(blob)
        return len(views) - 1

    groups = {}
    # lod1 first in the node list, lod0 last
    for lod in (1, 0):
        doc, binary = docs[lod]
        remap = {}
        for i, material in enumerate(doc.get("materials", [])):
            if material["name"] not in names:
                names[material["name"]] = len(materials)
                materials.append(material)
            remap[i] = names[material["name"]]
        children = []
        for node in doc["nodes"]:
            fresh = {"name": node["name"]}
            if "translation" in node:
                fresh["translation"] = node["translation"]
            if "mesh" in node:
                mesh = doc["meshes"][node["mesh"]]
                prims = []
                for prim in mesh["primitives"]:
                    attrs = {}
                    for key, index in prim["attributes"].items():
                        acc = doc["accessors"][index]
                        vals = _values(doc, binary, index)
                        if key == "POSITION":
                            whole = [tuple(round(c / unit) for c in v) for v in vals]
                            if max(abs(c) for v in whole for c in v) > 32767:
                                raise SystemExit(f"{out}: a position is too far from its pivot")
                            blob = b"".join(struct.pack("<3hxx", *v) for v in whole)
                            view = add(blob, 8)
                            accessors.append({"bufferView": view, "componentType": 5122, "count": len(whole), "type": "VEC3",
                                              "min": [min(v[c] for v in whole) for c in range(3)], "max": [max(v[c] for v in whole) for c in range(3)]})
                        elif key == "NORMAL":
                            blob = b"".join(struct.pack("<3bx", *(v if acc["componentType"] == 5120 else [max(-127, min(127, round(c * 127))) for c in v])) for v in vals)
                            view = add(blob, 4)
                            accessors.append({"bufferView": view, "componentType": 5120, "normalized": True, "count": len(vals), "type": "VEC3"})
                        elif key == "COLOR_0":
                            blob = b"".join(struct.pack("<4B", *v) for v in vals)
                            view = add(blob)
                            accessors.append({"bufferView": view, "componentType": 5121, "normalized": True, "count": len(vals), "type": "VEC4"})
                        else:
                            continue
                        attrs[key] = len(accessors) - 1
                    entry = {"attributes": attrs, "material": remap[prim["material"]]}
                    if "indices" in prim:
                        acc = doc["accessors"][prim["indices"]]
                        vals = [v[0] for v in _values(doc, binary, prim["indices"])]
                        code = "H" if max(vals) < 65536 else "I"
                        view = add(struct.pack(f"<{len(vals)}{code}", *vals))
                        accessors.append({"bufferView": view, "componentType": 5123 if code == "H" else 5125, "count": len(vals), "type": "SCALAR"})
                        entry["indices"] = len(accessors) - 1
                    if "mode" in prim:
                        entry["mode"] = prim["mode"]
                    prims.append(entry)
                meshes.append({"name": mesh.get("name", node["name"]), "primitives": prims})
                fresh["mesh"] = len(meshes) - 1
                fresh["scale"] = [unit] * 3
            nodes.append(fresh)
            children.append(len(nodes) - 1)
        groups[lod] = children
    for lod in (1, 0):
        nodes.append({"name": f"lod{lod}", "children": groups[lod]})
    roots = [len(nodes) - 1, len(nodes) - 2]
    doc = {"asset": {"generator": "twisty tools/blender/bikes/_kit_c.py", "version": "2.0"}, "scene": 0, "scenes": [{"name": "Scene", "nodes": roots}],
           "nodes": nodes, "materials": materials, "meshes": meshes, "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": offset}],
           "extensionsUsed": ["KHR_mesh_quantization"], "extensionsRequired": ["KHR_mesh_quantization"]}
    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    body = b"".join(chunks)
    blob = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(body))
    blob += struct.pack("<II", len(text), 0x4E4F534A) + text + struct.pack("<II", len(body), 0x004E4942) + body
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "wb").write(blob)
    return len(blob)


# ---------------------------------------------------------------- the CP3 platform

RAKE_CP3 = math.radians(25)


def cp3_chassis(k, frame_mat="frame", swing_mat="frame", sub_mat="matt_black", case_mat="engine", cover_mat="cover", header_mat="bronze",
                box_mat="matt_black", shield_mat="steel_dark", peg=(0.2, 0.38, -0.22), engine_scale=1.0, cam_mat="matt_black", swing_x=0.118, disc_rear_x=0.086, chain_x=-0.097):
    """Frame, engine, radiator, exhaust, swingarm, shock, chain, rear brake
    and pegs of the 890 cc crossplane-triple naked platform, in the body
    node. The wheels, forks and bodywork are the bike's own."""
    hi = k.hi
    k.begin("body")
    # Steering head, and the broad cast frame band each side from the head
    # down round the engine to the pivot, splaying out from the head
    k.rod((0, 0.8, 0.4), (0, 0.98, 0.32), 0.032, frame_mat, seg=k.seg(14, 8))
    band = [(0.38, 0.97), (0.26, 0.93), (0.1, 0.86), (-0.06, 0.78), (-0.15, 0.68), (-0.2, 0.5), (-0.18, 0.34), (-0.08, 0.32), (-0.05, 0.44),
            (-0.07, 0.56), (0.0, 0.64), (0.14, 0.7), (0.28, 0.76), (0.4, 0.82)]
    for side in (-1, 1):
        skin(k, band, lambda z: 0.06 + 0.1 * smooth((0.38 - z) / 0.3), 0.036, frame_mat, side, bevel=k.seg(0.008, 0))
        if hi:
            k.cylinder(0.024, 0.012, (side * 0.18, 0.42, -0.12), "steel", axis="x", seg=12)
            k.cylinder(0.016, 0.01, (side * 0.178, 0.6, -0.12), "steel", axis="x", seg=8)
            k.cylinder(0.014, 0.01, (side * 0.17, 0.66, 0.1), "steel", axis="x", seg=8)
        # Subframe: a top rail and a strut up to the tail
        k.rod((side * 0.13, 0.78, -0.1), (side * 0.075, 0.87, -0.66), 0.012, sub_mat, seg=k.seg(8, 5))
        k.rod((side * 0.15, 0.58, -0.17), (side * 0.085, 0.83, -0.5), 0.011, sub_mat, seg=k.seg(8, 5))
    # Engine
    crank = (0.38, 0.05)
    about = (0, crank[0], crank[1])
    with scaled(k, about, engine_scale):
        inline_triple(k, crank, case_mat=case_mat, cover_mat=cover_mat, head_mat=case_mat, cam_mat=cam_mat, tilt=0.38)
        triple_detail(k, crank, 0.38, case_mat=case_mat, cover_mat=cover_mat)
    # Throttle bodies, airbox and wiring that fill the frame between the head and the tank
    k.box((0.24, 0.16, 0.34), (0, 0.76, 0.06), "matt_black", rot=(0.15, 0, 0), bevel=k.seg(0.02, 0))
    if hi:
        for xx in (-0.08, 0, 0.08):
            k.rod((xx, 0.7, 0.2), (xx, 0.78, 0.1), 0.026, "steel_dark", seg=10)
    # Radiator in front of the engine, curved shrouds hide its sides
    radiator(k, (0, 0.6, 0.39), (0.34, 0.25, 0.045), -0.28)
    # Exhaust: three headers off the head, down in front of the engine and back into the box under it
    turn = euler(0.38, 0, 0)
    base = Vector((0, crank[0] + 0.07, crank[1] + 0.07))
    for xx in (-0.1, 0, 0.1):
        port = base + turn @ Vector((xx, 0.22, 0.1))
        port = Vector(about) + (port - Vector(about)) * engine_scale
        k.tube([tuple(port), (xx * 0.95, port.y - 0.08, port.z + 0.07), (xx * 0.8, 0.28, 0.33), (xx * 0.6, 0.16, 0.26), (xx * 0.35 + 0.02, 0.12, 0.12)],
               0.019, header_mat, seg=k.seg(10, 6), smooth=k.seg(3, 1))
    # Collector and silencer box under the engine, its outlet low on the right
    k.loft([(0.16, 0.1, 0.2, 0.07), (0.1, 0.07, 0.22, 0.12, 3, 3, 0.5, 1, 1, 0.02), (-0.12, 0.06, 0.21, 0.13, 3, 3, 0.5, 1, 1, 0.03),
            (-0.24, 0.08, 0.2, 0.11, 3, 3, 0.5, 1, 1, 0.05), (-0.29, 0.1, 0.19, 0.07, 3, 3, 0.5, 1, 1, 0.06)], box_mat, ring=k.seg(16, 8), steps=k.seg(2, 1))
    k.panel([(0.02, 0.195), (-0.2, 0.19), (-0.245, 0.13), (-0.02, 0.105)], 0.172, 0.008, shield_mat, toe=-0.08, bevel=k.seg(0.004, 0))
    for dz in ((-0.02, 0.02) if hi else (0,)):
        k.cylinder(0.022, 0.03, (0.12, 0.11, -0.285 + dz), "steel_dark", axis="x", rot=(0, 0, -0.5), seg=k.seg(12, 6))
    # Swingarm: a cast arm each side, deep at the pivot, with the brace on the right
    for side in (-1, 1):
        k.panel([(-0.08, 0.475), (-0.3, 0.42), (-0.62, 0.345), (-0.76, 0.33), (-0.77, 0.27), (-0.62, 0.255), (-0.3, 0.32), (-0.1, 0.36)],
                side * swing_x, 0.035, swing_mat, bevel=k.seg(0.008, 0))
        # Chain adjuster block at the axle
        k.box((0.012, 0.045, 0.06), (side * (swing_x + 0.022), 0.3, -0.7), "steel", bevel=k.seg(0.004, 0))
    k.box((swing_x * 2, 0.06, 0.07), (0, 0.42, -0.2), swing_mat, bevel=k.seg(0.01, 0))
    k.rod((-swing_x - 0.04, 0.42, -0.12), (swing_x + 0.04, 0.42, -0.12), 0.018, "steel_dark", seg=k.seg(10, 6))
    k.rod((-swing_x - 0.04, 0.3, -0.7), (swing_x + 0.04, 0.3, -0.7), 0.012, "steel", seg=k.seg(8, 5))
    # Rear shock behind the engine, and its linkage
    shock(k, (0, 0.66, -0.17), (0, 0.4, -0.27), 0.028, spring_mat="spring")
    k.box((0.05, 0.04, 0.12), (0, 0.33, -0.24), "steel_dark", rot=(0.4, 0, 0), bevel=k.seg(0.006, 0))
    # Chain, front sprocket cover and a lower chain guard
    chain(k, chain_x, (0.4, -0.05, 0.042), (0.3, -0.7, 0.104))
    # Rear caliper behind the axle on its bracket, and the torque arm
    caliper(k, (disc_rear_x, 0.3, -0.7), 0.1225, math.radians(200), size=(0.085, 0.045))
    k.beam((swing_x - 0.01, 0.3, -0.7), (swing_x - 0.01, 0.32, -0.55), (0.012, 0.03), "steel_dark", bevel=0)
    k.beam((disc_rear_x + 0.026, 0.27, -0.79), (swing_x - 0.01, 0.3, -0.7), (0.012, 0.03), "dark_metal", bevel=0)
    # Pegs on cast hangers with heel plates, pillion pegs on the subframe
    pegs(k, peg, hanger_mat=frame_mat, hanger=(0.5, -0.15))
    for side in (-1, 1):
        k.rod((side * 0.15, 0.48, -0.42), (side * 0.22, 0.48, -0.42), 0.01, "steel_dark", seg=k.seg(8, 5))
        k.panel([(-0.36, 0.62), (-0.42, 0.5), (-0.46, 0.46), (-0.4, 0.46), (-0.32, 0.58)], side * 0.145, 0.012, sub_mat, bevel=k.seg(0.003, 0))
    # Side stand
    k.side_stand((-0.16, 0.3, -0.04), (-0.27, 0.03, 0.04), 0.011, "steel_dark", seg=k.seg(8, 5), pad=True)
    return crank


# ---------------------------------------------------------------- second pass shapes

def blade(k, rows, thick, mat, side, sharp=25):
    """A faceted panel: `rows` are cross-sections along the bike, each a list
    of (z, y, x) points down the outer face (top edge, creases, bottom edge),
    every row with the same count. The back face stands `thick` inboard."""
    m = len(rows[0])
    verts = []
    for row in rows:
        for z, y, x in row:
            verts.append((side * x, y, z))
    for row in rows:
        for z, y, x in row:
            verts.append((side * (x - thick), y, z))
    n = len(rows)
    back = n * m
    faces = []
    for i in range(n - 1):
        for j in range(m - 1):
            a, b = i * m + j, (i + 1) * m + j
            faces.append((a, b, b + 1, a + 1))
            faces.append((back + a, back + a + 1, back + b + 1, back + b))
    for i in range(n - 1):
        for j in (0, m - 1):
            a, b = i * m + j, (i + 1) * m + j
            faces.append((a, back + a, back + b, b))
    for i in (0, n - 1):
        for j in range(m - 1):
            a = i * m + j
            faces.append((a, a + 1, back + a + 1, back + a))
    return k.emit(verts, faces, mat, sharp=sharp)


def front_plate(k, outline, z, thick, mat, tilt=0.0, centre=(0, 0.84), bevel=0.0):
    """A plate cut to a front-view outline of (x, y) points, `thick` along
    the bike at `z`, its top leaned back by `tilt` about `centre` (y, z)."""
    from mathutils import Vector as V
    turn = euler(-tilt, 0, 0)
    pivot = V((0, centre[1], z))
    n = len(outline)
    verts = []
    for dz in (-thick / 2, thick / 2):
        for x, y in outline:
            verts.append(tuple(pivot + turn @ (V((x, y, z + dz)) - pivot)))
    faces = [tuple(range(n)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, j + n, i + n))
    return k.emit(verts, faces, mat, bevel=bevel, sharp=30)


def duffel(k, centre, length, height, depth, mat="luggage", strap_mat="matt_black", tilt=0.0):
    """A soft duffel lying across the bike: a squarish, slightly sagging
    body with rounded ends, end pockets, two compression straps round it, a
    handle on top and a buckle on each strap."""
    cx, cy, cz = centre
    ring = k.seg(20, 10)
    stations = k.seg(12, 5)

    def section(u, grow=0.0):
        # u -1..1 along the bag; the ends round off and pinch
        f = (1 - abs(u) ** 6) ** 0.25
        f = 0.72 + 0.28 * f
        pts = []
        for i in range(ring):
            t = 2 * math.pi * (i + 0.5) / ring
            c, s = math.cos(t), math.sin(t)
            n = 2.7 if s > 0 else 3.2
            px = math.copysign(abs(c) ** (2 / n), c)
            py = math.copysign(abs(s) ** (2 / n), s)
            sag = -0.012 * (1 - u * u) if s > 0.7 else 0.0
            hz = (depth / 2 + grow) * f
            hy = (height / 2 + grow) * f
            pts.append((cx + u * length / 2, cy + py * hy + sag + tilt * px * hz, cz + px * hz))
        return pts

    us = [-1 + 2 * i / (stations - 1) for i in range(stations)]
    verts = [p for u in us for p in section(u)]
    faces = []
    for i in range(stations - 1):
        for j in range(ring):
            a, b = i * ring + j, i * ring + (j + 1) % ring
            faces.append((a, b, b + ring, a + ring))
    faces.append(tuple(reversed(range(ring))))
    faces.append(tuple(range(len(verts) - ring, len(verts))))
    k.emit(verts, faces, mat, sharp=50)
    if not k.hi:
        return
    # Compression straps round the body, a buckle on each
    for u in (-0.45, 0.45):
        inner = section(u, 0.004)
        outer = section(u + 0.06, 0.004)
        v = inner + outer
        f = [(j, (j + 1) % ring, ring + (j + 1) % ring, ring + j) for j in range(ring)]
        k.emit(v, f, strap_mat, sharp=50, solid=0.004)
        top = max(inner, key=lambda p: p[1])
        k.box((0.03, 0.01, 0.04), (top[0] + 0.012, top[1] + 0.006, top[2] - depth * 0.15), "steel_dark", bevel=0.003)
    # End pockets and a carry handle
    for s in (-1, 1):
        k.cylinder(min(height, depth) * 0.26, 0.01, (cx + s * (length / 2 - 0.02), cy, cz), strap_mat, axis="x", seg=14)
    k.tube([(cx - 0.07, cy + height * 0.5, cz), (cx - 0.04, cy + height * 0.5 + 0.035, cz), (cx + 0.04, cy + height * 0.5 + 0.035, cz),
            (cx + 0.07, cy + height * 0.5, cz)], 0.008, strap_mat, seg=6, smooth=2)


def scaled(k, about, factor):
    """A context in which everything the kit makes is scaled about a point."""
    class Ctx:
        def __enter__(self):
            self.orig = k.emit

            def emit(verts, faces, mat, **kw):
                ax, ay, az = about
                verts = [(ax + (v[0] - ax) * factor, ay + (v[1] - ay) * factor, az + (v[2] - az) * factor) for v in verts]
                return self.orig(verts, faces, mat, **kw)
            k.emit = emit

        def __exit__(self, *a):
            del k.emit
    return Ctx()


def triple_detail(k, crank, tilt, case_mat="engine", cover_mat="cover"):
    """Close-up detail on the triple: three bores standing proud on the
    block's front, a raised plug lobe for each on the cam cover, the case
    split line, the water pump and oil filter low at the front, the starter
    behind the block, coolant hoses and the clutch cover boss."""
    if not k.hi:
        return
    cy, cz = crank
    turn = euler(tilt, 0, 0)
    base = Vector((0, cy + 0.07, cz + 0.07))
    for xx in (-0.115, 0, 0.115):
        # Bore bulge on the block front, its water jacket rib
        p = base + turn @ Vector((xx, 0.1, 0.075))
        k.lathe([(0.048, -0.095), (0.05, -0.08), (0.05, 0.08), (0.046, 0.095)], tuple(p), case_mat, rot=(tilt, 0, 0), seg=14, arc=(0, math.pi))
        # Plug lobe on the cam cover and the coil
        q = base + turn @ Vector((xx, 0.33, 0.0))
        k.box((0.07, 0.03, 0.12), tuple(q), "matt_black", rot=(tilt, 0, 0), bevel=0.008)
    # Fins of the head between the ports
    for n in range(3):
        p = base + turn @ Vector((0, 0.205 + n * 0.018, 0.098))
        k.box((0.36, 0.006, 0.012), tuple(p), case_mat, rot=(tilt, 0, 0), bevel=0)
    # Crankcase split line both sides
    for side in (-1, 1):
        k.box((0.004, 0.008, 0.36), (side * 0.201, cy + 0.02, cz - 0.04), "matt_black", bevel=0)
    # Water pump and oil filter low at the front, the coolant hoses
    k.cylinder(0.045, 0.03, (-0.17, cy - 0.06, cz + 0.13), cover_mat, axis="x", seg=14)
    k.cylinder(0.038, 0.07, (0.07, cy - 0.11, cz + 0.17), "matt_black", rot=(0.9, 0, 0), seg=14)
    k.tube([(-0.17, cy - 0.04, cz + 0.16), (-0.14, cy + 0.08, cz + 0.27), (-0.13, 0.5, 0.36)], 0.014, "rubber", seg=7, smooth=2)
    k.tube([(0.1, 0.72, 0.28), (0.14, 0.7, 0.33), (0.15, 0.6, 0.37)], 0.014, "rubber", seg=7, smooth=2)
    # Starter motor behind the block
    k.cylinder(0.035, 0.12, (0.02, cy + 0.12, cz - 0.17), "matt_black", axis="x", seg=12)
    # The clutch cover's raised boss (right)
    k.lathe([(0, 0), (0.05, 0), (0.05, 0.012), (0, 0.016)], (0.245, cy - 0.01, cz - 0.07), cover_mat, axis="x", seg=16)
