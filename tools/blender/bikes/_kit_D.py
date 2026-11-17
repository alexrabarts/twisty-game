# Helpers for the detailed bikes of group D (bike10_tiger900.py,
# bike11_duke990.py, bike12_tracer9gt.py), on top of the shared kit
# (bike_kit.py, bike_parts.py), which this file does not change.
#
# A detailed bike file holds the bike twice, as two node groups: `lod0` (the
# hero model, at most 40,000 triangles) and `lod1` (for distance, at most
# 10,000). Inside each group the nodes carry the same names as a game bike
# file (body, wheel_front, wheel_rear, disc_front, disc_rear, fork_left,
# fork_right, handlebar, brake_light, headlight, and the bare points grip,
# peg and seat), so the game can swap one group for the other. The groups
# sit at the origin with no transform, so a node's translation is its pivot
# in the bike's axes, as in a game bike file.
#
# Shapes are written in the game's axes (x across, y up, z forward, metres,
# ground at y = 0), at the real bike's size, with the wheelbase centred on
# z = 0. The game's axes are right-handed, so +x is the rider's LEFT (B() in
# bike_kit.py turns them into Blender's without a mirror). A bike script
# writes the rider's right as +x, as the older bike scripts read, and the
# kit mirrors the finished shapes, so the chain, the silencer and the
# brake pedal land on the side the real bike carries them. The bare points
# (grip, peg) keep +x, as the game reads both sides from them.
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
from bike_kit import Kit, B, render, pack_colours  # noqa: E402

OUT_DIR = os.path.join(common.ASSETS, "bikes", "detail")
LODS = ("lod0", "lod1")
BUDGET = {"lod0": 40000, "lod1": 10000}
FILE_BUDGET = int(1.2 * 1024 * 1024)
# Positions are stored as whole half-millimetres in signed shorts (bike_kit.pack_colours)
UNIT = 0.0005
# Nodes that turn in the game: nothing else may shade them in the bake
ALONE = ("wheel_front", "wheel_rear", "disc_front", "disc_rear")
# In the distant model, finishes that read alike from afar become one. The
# rims, the gold forks and the calipers stay: they are how a bike is known.
LOW = {"chrome": "steel", "disc": "steel", "steel_dark": "dark_metal", "spring": "dark_metal", "vent": "dark_metal", "dash": "dark_metal",
       "carbon": "dark_metal", "signal": "dark_metal"}
# Nodes the distant model keeps whole, however small their shapes
KEEP = ("brake_light", "headlight", "wheel_front", "wheel_rear", "disc_front", "disc_rear")


def along(a, b, t):
    return tuple(p + (q - p) * t for p, q in zip(a, b))


class DKit(Kit):
    """The shared kit, building one bike at two levels of detail into one scene."""

    def __init__(self, seed, colours, cull=0.09):
        super().__init__(seed=seed, colours=colours)
        self.lod = "lod0"
        # Shapes smaller than this (metres, longest side) are left out of the distant model
        self.cull = cull
        # Set while drawing something the distant model must keep whatever its size
        self.keep = False

    def level(self, lod):
        self.lod = lod
        self.low = lod != "lod0"

    def begin(self, node, pivot=(0, 0, 0)):
        super().begin(f"{self.lod}_{node}", pivot)

    # In the distant model every turned, swept and lofted shape has fewer
    # segments round it and fewer steps along it
    def lathe(self, profile, at, mat, seg=16, **kw):
        return super().lathe(profile, at, mat, seg=max(6, seg // 2) if self.low else seg, **kw)

    def tube(self, points, radius, mat, seg=8, smooth=1, **kw):
        if self.low:
            seg, smooth = max(4, round(seg * 0.6)), max(1, smooth - 1)
        return super().tube(points, radius, mat, seg=seg, smooth=smooth, **kw)

    def loft(self, sections, mat, ring=14, steps=3, **kw):
        if self.low:
            ring, steps = max(8, (round(ring * 0.6) // 2) * 2), max(1, steps // 2)
        return super().loft(sections, mat, ring=ring, steps=steps, **kw)

    def sheet(self, fn, mat, nu=8, nv=6, **kw):
        if self.low:
            nu, nv = max(2, nu // 2), max(1, nv // 2)
        return super().sheet(fn, mat, nu=nu, nv=nv, **kw)

    # The kit turns every distant wheel into a plain cast one; a spoked or
    # coloured wheel is how a bike is known, so the distant model keeps its
    # style and colour and only loses segments (the caller passes `seg`)
    def wheel(self, *args, **kw):
        low = self.low
        self.low = False
        try:
            return super().wheel(*args, **kw)
        finally:
            self.low = low

    def emit(self, verts, faces, mat, **kw):
        if not self.low:
            return super().emit(verts, faces, mat, **kw)
        base = self.node.split("_", 1)[1]
        spans = [max(v[axis] for v in verts) - min(v[axis] for v in verts) for axis in range(3)]
        named = mat if isinstance(mat, str) else None
        if max(spans) < self.cull and not self.keep and base not in KEEP and named != "caliper":
            return None
        if isinstance(mat, list):
            mat = [LOW.get(name, name) for name in mat]
        elif callable(mat):
            mat = (lambda pick: lambda centre: LOW.get(pick(centre), pick(centre)))(mat)
        else:
            mat = LOW.get(mat, mat)
        # The kit's own low-detail rules are replaced by the ones above
        self.low = False
        try:
            return super().emit(verts, faces, mat, **kw)
        finally:
            self.low = True

    # Joins each node's shapes per level, moves them onto their pivots, bakes
    # the occlusion one level at a time, groups each level under its own
    # node and writes the file
    def finish_lods(self, path, anchors):
        joined = {}
        for key, shapes in self.nodes.items():
            common.select_only(shapes, shapes[0])
            if len(shapes) > 1:
                bpy.ops.object.join()
            obj = bpy.context.view_layer.objects.active
            obj.name = key
            obj.data.name = key
            # Mirrored across x: the rider's right as written goes to -x
            obj.data.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
            obj.data.flip_normals()
            px, py, pz = self.pivots[key]
            pivot = Vector(B((-px, py, pz)))
            obj.data.transform(Matrix.Translation(-pivot))
            obj.location = pivot
            joined[key] = obj
        for lod in LODS:
            mine = {key: obj for key, obj in joined.items() if key.startswith(lod + "_")}
            self.occlude_level(mine, joined)
        groups = {}
        marks = []
        for lod in LODS:
            group = bpy.data.objects.new(lod, None)
            self.scene.collection.objects.link(group)
            groups[lod] = group
            for key, obj in joined.items():
                if key.startswith(lod + "_"):
                    obj.parent = group
            for name, at in anchors.items():
                mark = bpy.data.objects.new(f"{lod}_{name}", None)
                mark.location = B(at)
                self.scene.collection.objects.link(mark)
                mark.parent = group
                marks.append(mark)
        common.export_glb(path, list(joined.values()) + marks + list(groups.values()), colours=True, texcoords=False)
        pack_colours(path, unit=UNIT)
        size = rename_nodes(path)
        counts = {lod: {} for lod in LODS}
        for key, obj in joined.items():
            lod, name = key.split("_", 1)
            counts[lod][name] = self.triangles([obj])
        totals = {lod: sum(c.values()) for lod, c in counts.items()}
        print(f"{os.path.basename(path)}: {size} bytes; " + "; ".join(f"{lod} {totals[lod]} triangles {counts[lod]}" for lod in LODS))
        for lod in LODS:
            if totals[lod] > BUDGET[lod]:
                raise SystemExit(f"{path}: {lod} has {totals[lod]} triangles, over its budget of {BUDGET[lod]}")
        if size > FILE_BUDGET:
            raise SystemExit(f"{path}: {size} bytes is over the budget of {FILE_BUDGET}")
        self.joined = joined
        self.totals = totals
        return joined

    # The kit's occlusion bake, with the other level hidden
    def occlude_level(self, mine, everything):
        world = bpy.data.worlds.new("bake")
        world.light_settings.distance = 0.22
        self.scene.world = world
        self.scene.render.bake.target = "VERTEX_COLORS"
        for key, obj in mine.items():
            attribute = obj.data.color_attributes.new("ao", "FLOAT_COLOR", "POINT")
            obj.data.color_attributes.active_color = attribute
            obj.data.color_attributes.render_color_index = 0
            alone = key.split("_", 1)[1] in ALONE
            for other in everything.values():
                other.hide_render = other is not obj and (other not in mine.values() or alone)
            common.select_only([obj])
            bpy.ops.object.bake(type="AO")
            values = [0.0] * (len(obj.data.vertices) * 4)
            attribute.data.foreach_get("color", values)
            for i in range(0, len(values), 4):
                shade = 0.3 + 0.7 * min(1.0, values[i] * 1.15) ** 1.3
                values[i:i + 4] = (shade, shade, shade, 1.0)
            attribute.data.foreach_set("color", values)
        for obj in everything.values():
            obj.hide_render = False

    def show(self, lod):
        for key, obj in self.joined.items():
            obj.hide_render = not key.startswith(lod + "_")


def rename_nodes(path):
    """Strips the level prefix off every node name ("lod1_wheel_front" becomes "wheel_front") and checks no node is turned."""
    data = open(path, "rb").read()
    length = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + length])
    rest = data[20 + length:]
    for node in doc["nodes"]:
        for lod in LODS:
            if node["name"].startswith(lod + "_"):
                node["name"] = node["name"][len(lod) + 1:]
        if "rotation" in node or "matrix" in node:
            raise SystemExit(f"{path}: node {node['name']} is turned")
    for mesh in doc.get("meshes", []):
        for lod in LODS:
            if mesh.get("name", "").startswith(lod + "_"):
                mesh["name"] = mesh["name"][len(lod) + 1:]
    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(text) + len(rest))
    out += struct.pack("<II", len(text), 0x4E4F534A) + text + rest
    open(path, "wb").write(out)
    return len(out)


def caliper(k, disc, radius, angle, size=(0.05, 0.06, 0.11), mat="caliper", pistons=True):
    """A caliper straddling a disc at `disc` (its centre on the axle), at `angle` from straight ahead up over the top."""
    x, y, z = disc
    r = radius * 0.86
    at = (x, y + math.sin(angle) * r, z + math.cos(angle) * r)
    roll = math.pi / 2 - angle
    k.box(size, at, mat, rot=(roll, 0, 0), bevel=0.012)
    if pistons and not k.low:
        # Piston bulges on the outer face, along the rim
        for t in (-0.28, 0.28):
            tz = math.cos(angle + math.pi / 2) * size[2] * t
            ty = math.sin(angle + math.pi / 2) * size[2] * t
            out = 1 if x > 0 else -1
            k.cylinder(0.019, 0.012, (x + out * (size[0] / 2 + 0.004), at[1] + ty, at[2] + tz), mat, axis="x", seg=10)


def usd_fork(k, side, axle, top, outer_r, inner_r, outer_mat, inner_mat="chrome", lug_mat="dark_metal", split=0.42, cap_mat="dark_metal",
             disc=None, caliper_angle=math.radians(205), caliper_size=(0.05, 0.06, 0.11), x=0.1, guard=None, adjuster=None):
    """One upside-down fork leg from the axle lug to above the top yoke; `disc` is (x, radius) of the disc it brakes."""
    a = (side * x, axle[0], axle[1])
    b = (side * x, top[0], top[1])
    # Axle lug and the caliper mount behind it
    k.box((outer_r * 2.5, 0.075, 0.07), along(a, b, 0.01), lug_mat, bevel=0.012)
    k.rod(along(a, b, 0.03), along(a, b, split + 0.04), inner_r, inner_mat, seg=14)
    # Dust seal and the fat outer tube, its foot a shade wider
    k.rod(along(a, b, split - 0.01), along(a, b, split + 0.03), outer_r * 1.08, "dark_metal", seg=14)
    k.rod(along(a, b, split + 0.03), b, outer_r, outer_mat, seg=16)
    k.rod(b, along(a, b, 1.03), outer_r * 0.86, cap_mat, seg=12)
    if adjuster:
        k.cylinder(outer_r * 0.5, 0.012, along(a, b, 1.04), adjuster, rot=tilt(a, b), seg=10)
    if guard:
        # A shield on the outer side of the slider
        out = Vector((side * inner_r * 0.9, 0, 0))
        k.rod(tuple(Vector(along(a, b, 0.05)) + out), tuple(Vector(along(a, b, split - 0.02)) + out), inner_r * 1.35, guard, seg=8)
    if disc:
        dx, dr = disc
        # Bracket from the lug to the caliper, then the caliper on the disc
        ca = caliper_angle
        cr = dr * 0.86
        cat = (side * dx, axle[0] + math.sin(ca) * cr, axle[1] + math.cos(ca) * cr)
        k.beam((side * (x - 0.005), axle[0] + 0.01, axle[1] - 0.02), (side * (dx + 0.03), cat[1], cat[2]), (0.02, 0.03), lug_mat, bevel=0.004)
        caliper(k, (side * dx, axle[0], axle[1]), dr, ca, size=caliper_size)


def tilt(a, b):
    """The Euler (x only) that stands a part along the line a-b in the bike's side plane."""
    return (math.atan2(b[2] - a[2], b[1] - a[1]), 0, 0)


def yokes(k, x, axle, top, width, mat="dark_metal", lower=0.78):
    """Top and bottom yokes and the stem between the fork legs, as part of the body."""
    lean = math.atan2(axle[1] - top[1], top[0] - axle[0])
    for t, deep, h in ((1.0, 0.035, 0.08), (lower, 0.045, 0.09)):
        y, z = axle[0] + (top[0] - axle[0]) * t, axle[1] + (top[1] - axle[1]) * t
        k.box((x * 2 + width, deep, h), (0, y, z - 0.025), mat, rot=(lean, 0, 0), bevel=0.012)
    k.rod((-x - 0.012, axle[0], axle[1]), (x + 0.012, axle[0], axle[1]), 0.012, "steel", seg=8)


def hand_guard(k, grip, side, mat="dark_metal", length=0.15):
    """A wrap-round hand guard from the bar end forward and back to the bar root."""
    g = Vector((side * grip[0], grip[1], grip[2]))
    out = Vector((side, 0, 0))
    front = Vector((0, 0.01, 1))
    pts = [g + out * 0.075, g + out * 0.08 + front * 0.06, g + out * 0.03 + front * 0.1 + Vector((0, 0.01, 0)), g - out * 0.06 + front * 0.085,
           g - out * (length - 0.02) + front * 0.04]
    k.tube(pts, 0.011, "steel_dark", seg=6, smooth=2)

    # The shell: a sheet that rises off the bar line toward the front
    def shell(u, v):
        p = g + out * (0.08 - u * (length - 0.0)) + front * (0.05 + 0.055 * math.sin(math.pi * min(1, u * 1.2 + 0.1)))
        return tuple(p + Vector((0, (v - 0.5) * 0.085, 0.008 * (v - 0.5))))

    k.sheet(shell, mat, nu=5, nv=2, thick=0.006)


def lever_set(k, grip, side, root_x):
    """Grip, bar-end weight, lever, perch and switch block on a straight bar."""
    g = Vector((side * grip[0], grip[1], grip[2]))
    out = Vector((side, 0, 0))
    ahead = Vector((0, -0.2, 1)).normalized()
    k.rod(g - out * 0.065, g + out * 0.06, 0.018, "rubber", seg=10)
    k.rod(g + out * 0.06, g + out * 0.08, 0.02, "steel_dark", seg=10)
    k.box((0.045, 0.04, 0.05), g - out * 0.095, "dark_metal", bevel=0.008)
    k.rod(g - out * 0.11 + ahead * 0.035, g + out * 0.05 + ahead * 0.07, 0.006, "steel", seg=5)
    if side > 0:
        # Front brake master cylinder and its reservoir
        k.cylinder(0.016, 0.05, g - out * 0.135 + Vector((0, 0.005, 0.02)), "dark_metal", axis="x", seg=8)
        k.box((0.04, 0.03, 0.03), g - out * 0.15 + Vector((0, 0.045, 0.0)), "steel_dark", bevel=0.006)


def mirror(k, root, head, size=(0.06, 0.042), mat="dark_metal", shape="rect"):
    """A mirror on a stalk each side: `root` and `head` for the right side."""
    for side in (-1, 1):
        a = Vector((side * root[0], root[1], root[2]))
        b = Vector((side * head[0], head[1], head[2]))
        k.tube([a, a.lerp(b, 0.55) + Vector((0, 0.02, 0)), b], 0.007, mat, seg=5, smooth=2)
        w, h = size
        c = b + Vector((side * w * 0.3, 0, 0))
        round_ = 2.4 if shape == "rect" else 2.0
        k.loft([(c.z - 0.016, c.y - h * 0.5, c.y + h * 0.5, w * 0.5, round_, round_, 0.5, 1, 1, c.x),
                (c.z - 0.008, c.y - h, c.y + h, w, 3.2, 3.2, 0.5, 1, 1, c.x),
                (c.z + 0.006, c.y - h * 0.95, c.y + h * 0.95, w * 0.95, 3.2, 3.2, 0.5, 1, 1, c.x),
                (c.z + 0.008, c.y - h * 0.9, c.y + h * 0.9, w * 0.9, 3.2, 3.2, 0.5, 1, 1, c.x)], mat, ring=12, steps=1)
        k.box((w * 1.75, h * 1.75, 0.004), (c.x, c.y, c.z - 0.0165), "chrome", bevel=0)


def indicator(k, root, tip, mat="signal", stalk="dark_metal", radius=0.012):
    k.rod(root, along(root, tip, 0.65), radius * 0.55, stalk, seg=6)
    k.rod(along(root, tip, 0.6), tip, radius, mat, seg=8, top=radius * 0.8)


def plate(k, centre, size=(0.2, 0.15), lean=0.25):
    """A blank number plate facing back, leaning back at the top by `lean`."""
    k.box((size[0], size[1], 0.006), centre, "plate", rot=(lean, 0, 0), bevel=0)


def top_box(k, centre, size, lid="steel", body="luggage", caps="dark_metal", lid_share=0.42):
    """A hard top box: a black body, an aluminium lid over its upper part, black corner caps and a catch."""
    cx, cy, cz = centre
    w, h, d = size
    lo = cy - h / 2
    split = lo + h * (1 - lid_share)
    k.box((w, split - lo, d), (cx, (lo + split) / 2, cz), body, bevel=0.03)
    k.box((w * 1.01, h * lid_share, d * 1.01), (cx, (split + cy + h / 2) / 2, cz), lid, bevel=0.025)
    k.box((w * 0.86, 0.012, d * 0.86), (cx, cy + h / 2 + 0.002, cz), lid, bevel=0.01)
    # Vertical corner caps and the seam
    for sx in (-1, 1):
        for sz in (-1, 1):
            k.box((0.05, h * 1.0, 0.05), (cx + sx * (w / 2 - 0.018), cy, cz + sz * (d / 2 - 0.018)), caps, bevel=0.012)
    k.box((w * 1.02, 0.014, d * 1.02), (cx, split, cz), caps, bevel=0.004)
    # The catch on the back face and the reflector
    k.box((0.07, 0.07, 0.025), (cx, split - 0.01, cz - d / 2 - 0.005), caps, bevel=0.008)
    k.box((0.16, 0.025, 0.006), (cx, lo + 0.05, cz - d / 2 - 0.002), "reflector", bevel=0)


def roll_bag(k, centre, length, radius, mat="luggage", strap="dark_metal", axis="x"):
    """A soft roll bag lying across the seat, with two straps round it and rolled ends."""
    cx, cy, cz = centre
    prof = [(0, -length / 2), (radius * 0.7, -length / 2), (radius * 0.95, -length / 2 + 0.03), (radius, -length / 2 + 0.07), (radius, length / 2 - 0.07),
            (radius * 0.95, length / 2 - 0.03), (radius * 0.7, length / 2), (0, length / 2)]
    k.lathe(prof, centre, mat, axis=axis, seg=14, ripple=lambda i, j: (0.012 if i in (10, 11) else 0) if 2 <= j <= 5 else 0)
    for t in (-0.27, 0.27):
        k.lathe([(radius + 0.004, t * length - 0.018), (radius + 0.004, t * length + 0.018)], centre, strap, axis=axis, seg=14, solid=0.004)


# With TWISTY_PREVIEW set to a directory, renders the finished model there:
# both sides, the front and rear three-quarters, and the distant model side on
def previews(k, name, height=0.7, reach=1.0):
    out = os.environ.get("TWISTY_PREVIEW")
    if not out:
        return
    os.makedirs(out, exist_ok=True)
    d = 4.9 * reach
    # Named by the rider's side: the rider's right is -x in the game's axes
    views = {
        "right": ((-d, height + 0.05, 0.0), (0, height, 0.0)),
        "left": ((d, height + 0.05, 0.0), (0, height, 0.0)),
        "front-right": ((-d * 0.55, 1.45, d * 0.72), (0, height - 0.05, 0.05)),
        "front-left": ((d * 0.55, 1.45, d * 0.72), (0, height - 0.05, 0.05)),
        "rear-right": ((-d * 0.55, 1.6, -d * 0.72), (0, height - 0.05, -0.05)),
        "rear-left": ((d * 0.55, 1.6, -d * 0.72), (0, height - 0.05, -0.05)),
    }
    # For the look only (the file is written): the screen as clear plastic, as the game draws it
    glass = bpy.data.materials.get("glass")
    if glass:
        shader = glass.node_tree.nodes["Principled BSDF"]
        shader.inputs["Alpha"].default_value = 0.3
    k.show("lod0")
    for view, (eye, target) in views.items():
        render(k.scene, os.path.join(out, f"{name}-lod0-{view}.png"), eye, target, size=(1280, 860), lens=50)
    k.show("lod1")
    for view in ("right", "front-left"):
        eye, target = views[view]
        render(k.scene, os.path.join(out, f"{name}-lod1-{view}.png"), eye, target, size=(1280, 860), lens=50)
    k.show("lod0")


def wheel(k, centre, radius, width, rim, spokes="wire", count=32, hub=0.055, seg=None, pair=False, sweep=0.0, rim_mat="rim", spoke_mat=None, tread=True):
    """A road wheel spinning on x: tyre, rim, and either `count` wire spokes laced to the rim's shoulders or `count` cast blades.

    Built at full shape in the distant model too (fewer segments only), since
    the wheel is how a bike is known: a spoked wheel stays spoked."""
    low = k.low
    k.low = False
    try:
        cx, cy, cz = centre
        seg = seg or (24 if low else 48)
        tube = rim + 0.4 * (radius - rim)
        steps = 6 if low else 10
        profile = [(rim - 0.004, -0.34 * width), (rim + 0.012, -0.41 * width)]
        for j in range(steps + 1):
            a = math.radians(-90 + 180 * j / steps)
            profile.append((tube + (radius - tube) * math.cos(a), math.sin(a) * width / 2))
        profile += [(rim + 0.012, 0.41 * width), (rim - 0.004, 0.34 * width)]

        def groove(i, j):
            row = j - 2
            if not tread or low or row < 2 or row > steps - 2 or row == steps // 2:
                return 0.0
            lean = row if row < steps // 2 else steps - row
            return -0.006 if (i + lean) % 6 in (0, 1) else 0.0

        k.lathe(profile, centre, "rubber", axis="x", seg=seg, ripple=groove, sharp=50)
        w = width
        barrel = [(rim + 0.006, -0.4 * w), (rim + 0.007, -0.45 * w), (rim - 0.02, -0.42 * w), (rim - 0.03, -0.18 * w),
                  (rim - 0.03, 0.18 * w), (rim - 0.02, 0.42 * w), (rim + 0.007, 0.45 * w), (rim + 0.006, 0.4 * w)]
        k.lathe(barrel, centre, rim_mat, axis="x", seg=seg, sharp=40)
        inner = rim - 0.028
        if spokes == "wire":
            # Hub with a flange each side, spokes from the flanges out to the
            # rim's shoulders, crossing each other
            k.lathe([(0, -0.065), (0.03, -0.065), (0.03, -0.05), (hub, -0.045), (hub, -0.03), (0.034, -0.025), (0.034, 0.025), (hub, 0.03), (hub, 0.045),
                     (0.03, 0.05), (0.03, 0.065), (0, 0.065)], centre, "dark_metal", axis="x", seg=16 if low else 24)
            n = count // 2 if low else count
            for i in range(n):
                side = 1 if i % 2 else -1
                a = 2 * math.pi * i / n
                b = a + (0.55 if (i // 2) % 2 else -0.55)
                start = (cx + side * 0.04, cy + math.cos(a) * hub * 0.85, cz + math.sin(a) * hub * 0.85)
                end = (cx + side * 0.36 * w, cy + math.cos(b) * (rim - 0.012), cz + math.sin(b) * (rim - 0.012))
                k.tube([start, end], 0.0026, spoke_mat or "chrome", seg=3 if low else 4, cap=False)
            return
        # Cast: `count` blades (or pairs) from the hub to the rim, swept by `sweep` radians
        k.lathe([(0, -width * 0.4), (hub, -width * 0.4), (hub * 1.2, -0.015), (hub * 1.2, 0.015), (hub, width * 0.4), (0, width * 0.4)],
                centre, rim_mat, axis="x", seg=12 if low else 20)
        for i in range(count):
            base = 2 * math.pi * i / count
            for off in ((-0.07, 0.07) if pair else (0.0,)):
                a0, a1 = base + off * 0.5, base + off + sweep
                ends = ((a0, hub * 1.05, 0.016, 0.022), (a1, inner + 0.006, 0.01, 0.012))
                verts = []
                for a, r, half, deep in ends:
                    out = Vector((0, math.cos(a), math.sin(a)))
                    tang = Vector((0, -math.sin(a), math.cos(a)))
                    for dx in (-deep, deep):
                        for dt in (-half, half):
                            verts.append(Vector(centre) + out * r + tang * dt + Vector((dx, 0, 0)))
                faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
                k.emit(verts, faces, spoke_mat or rim_mat, bevel=0 if low else 0.004)
    finally:
        k.low = low


def panel(k, outline, x, thick, mat, toe=0.0, **kw):
    """Kit.panel turned by `toe` about its own middle, not about z = 0, so it stays at `x` where it is drawn."""
    mid = sum(z for z, _ in outline) / len(outline)
    return k.panel(outline, x - mid * math.sin(toe), thick, mat, toe=toe, **kw)


def surface_x(sections, z, y):
    """Half-width of a z-axis loft (Kit.loft's sections) at place z and height y, from the sections either side, linearly."""
    defaults = (2.4, 2.4, 0.5, 1.0, 1.0, 0.0)
    full = sorted((tuple(s) + defaults[len(s) - 4:] for s in sections), key=lambda s: s[0])
    z = min(max(z, full[0][0]), full[-1][0])
    for a, b in zip(full, full[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / max(1e-9, b[0] - a[0])
            s = [p + (q - p) * t for p, q in zip(a, b)]
            break
    _, lo, hi, w, nt, nb, mid, wt, wb, c = s
    centre = lo + (hi - lo) * mid
    up = y >= centre
    h, n, narrow = (hi - centre, nt, wt) if up else (centre - lo, nb, wb)
    py = min(1.0, abs(y - centre) / max(1e-6, h))
    px = (1 - py ** n) ** (1 / n)
    return c + w * px * (1 - (1 - narrow) * py)


def decal(k, sections, corners, mat, lift=0.004, nu=10, nv=3):
    """A thin graphic laid on both flanks of a loft: `corners` are (z, y) for front-top, front-bottom, rear-bottom, rear-top."""
    ft, fb, rb, rt = corners
    for side in (-1, 1):
        def at(u, v):
            top = (ft[0] + (rt[0] - ft[0]) * u, ft[1] + (rt[1] - ft[1]) * u)
            bottom = (fb[0] + (rb[0] - fb[0]) * u, fb[1] + (rb[1] - fb[1]) * u)
            z, y = top[0] + (bottom[0] - top[0]) * v, top[1] + (bottom[1] - top[1]) * v
            return (side * (surface_x(sections, z, y) + lift), y, z)
        k.sheet(at, mat, nu=nu, nv=nv, thick=0.002)
